'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pkg = require('../package.json');
const {
    NextformsApi,
} = require('../dist/credentials/NextformsApi.credentials.js');
const {
    NextformsTrigger,
} = require('../dist/nodes/Nextforms/NextformsTrigger.node.js');
const { Nextforms } = require('../dist/nodes/Nextforms/Nextforms.node.js');

/** A stand-in for n8n's hook context: records the requests the node would make. */
const hookContext = ({ hookId, responses = {} } = {}) => {
    const calls = [];
    const warnings = [];
    const data = hookId ? { hookId } : {};
    return {
        calls,
        data,
        getCredentials: async () => ({
            apiKey: 'nf_test',
            baseUrl: 'https://api.test.nextforms.dev/',
        }),
        getNodeParameter: (name) => (name === 'formId' ? 'f1' : undefined),
        getWorkflow: () => ({ name: 'Leads to CRM' }),
        getNodeWebhookUrl: () => 'https://n8n.example/webhook/abc',
        getWorkflowStaticData: () => data,
        warnings,
        logger: { warn: (message) => warnings.push(message) },
        helpers: {
            httpRequestWithAuthentication: async function (
                credential,
                options,
            ) {
                calls.push({ credential, ...options });
                const key = `${options.method} ${options.url}`;
                if (responses[key] instanceof Error) throw responses[key];
                return responses[key] ?? {};
            },
        },
    };
};

test('the package lists its files where n8n looks, and they exist', () => {
    assert.ok(pkg.keywords.includes('n8n-community-node-package'));
    for (const file of [...pkg.n8n.credentials, ...pkg.n8n.nodes]) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
    }
    assert.ok(
        fs.existsSync(
            path.join(
                __dirname,
                '..',
                'dist',
                'nodes',
                'Nextforms',
                'nextforms.svg',
            ),
        ),
        'icon copied',
    );
});

test('the credential is a bearer key tested against /v1/me', () => {
    const cred = new NextformsApi();
    assert.equal(cred.name, 'nextformsApi');
    assert.equal(
        cred.authenticate.properties.headers.Authorization,
        '=Bearer {{$credentials.apiKey}}',
    );
    assert.equal(cred.test.request.url, '/v1/me');
    assert.ok(
        cred.properties.find((p) => p.name === 'apiKey').typeOptions.password,
    );
});

test('activating registers a hook for the form, labelled for the editor, and remembers it', async () => {
    const node = new NextformsTrigger();
    const ctx = hookContext({
        responses: {
            'POST https://api.test.nextforms.dev/v1/hooks': { id: 'h1' },
        },
    });
    assert.equal(await node.webhookMethods.default.create.call(ctx), true);
    const call = ctx.calls[0];
    assert.equal(call.credential, 'nextformsApi');
    assert.deepEqual(call.body, {
        formId: 'f1',
        targetUrl: 'https://n8n.example/webhook/abc',
        label: 'n8n: Leads to CRM',
    });
    assert.equal(ctx.data.hookId, 'h1');
});

test('checkExists asks Nextforms, and forgets a hook that is gone', async () => {
    const node = new NextformsTrigger();
    const alive = hookContext({
        hookId: 'h1',
        responses: {
            'GET https://api.test.nextforms.dev/v1/hooks/h1': { id: 'h1' },
        },
    });
    assert.equal(
        await node.webhookMethods.default.checkExists.call(alive),
        true,
    );
    const gone = hookContext({
        hookId: 'h1',
        responses: {
            'GET https://api.test.nextforms.dev/v1/hooks/h1': new Error('404'),
        },
    });
    assert.equal(
        await node.webhookMethods.default.checkExists.call(gone),
        false,
    );
    assert.equal(gone.data.hookId, undefined);
    assert.equal(
        await node.webhookMethods.default.checkExists.call(hookContext()),
        false,
    );
});

test('deactivating unsubscribes and tolerates a hook already removed', async () => {
    const node = new NextformsTrigger();
    const ctx = hookContext({
        hookId: 'h1',
        responses: {
            'DELETE https://api.test.nextforms.dev/v1/hooks/h1': new Error(
                '404',
            ),
        },
    });
    assert.equal(await node.webhookMethods.default.delete.call(ctx), true);
    assert.equal(ctx.calls[0].method, 'DELETE');
    assert.equal(ctx.data.hookId, undefined);
    assert.match(ctx.warnings[0], /could not remove hook h1/);
});

test('a delivery is passed through as one item', async () => {
    const node = new NextformsTrigger();
    const body = { id: 'r1', answers: {}, workflow: { event: 'approved' } };
    const result = await node.webhook.call({
        getBodyData: () => body,
        getNodeParameter: () => true,
        helpers: { returnJsonArray: (data) => [{ json: data }] },
    });
    assert.deepEqual(result.workflowData, [[{ json: body }]]);
});

test('a delivery carries its uploaded files as binary data, file_1 onwards', async () => {
    const node = new NextformsTrigger();
    const body = {
        id: 'r1',
        answers: {
            q1: { type: 'text', display: 'Ada' },
            q2: {
                type: 'file',
                files: [
                    { id: 'a.pdf', name: 'cv.pdf' },
                    { id: 'b.png', name: 'photo.png' },
                    { id: 'gone.jpg', name: 'gone.jpg' },
                ],
            },
        },
    };
    const urls = [];
    const ctx = {
        getBodyData: () => body,
        getNodeParameter: () => true,
        getCredentials: async () => ({
            apiKey: 'nf_test',
            baseUrl: 'https://api.test.nextforms.dev',
        }),
        helpers: {
            returnJsonArray: (data) => [{ json: data }],
            httpRequestWithAuthentication: async function (
                credential,
                options,
            ) {
                urls.push(options.url);
                if (options.url.endsWith('gone.jpg')) throw new Error('404');
                const name = options.url.endsWith('a.pdf')
                    ? 'cv.pdf'
                    : 'photo.png';
                return {
                    body: Buffer.from(name),
                    headers: {
                        'content-type': name.endsWith('pdf')
                            ? 'application/pdf'
                            : 'image/png',
                        'content-disposition':
                            "attachment; filename*=UTF-8''" + name,
                    },
                };
            },
            prepareBinaryData: async (data, fileName, mimeType) => ({
                fileName,
                mimeType,
            }),
        },
    };
    const result = await node.webhook.call(ctx);
    const [[item]] = result.workflowData;
    assert.equal(item.json, body);
    assert.deepEqual(item.binary, {
        file_1: { fileName: 'cv.pdf', mimeType: 'application/pdf' },
        file_2: { fileName: 'photo.png', mimeType: 'image/png' },
    });
    assert.deepEqual(urls, [
        'https://api.test.nextforms.dev/v1/responses/r1/files/a.pdf',
        'https://api.test.nextforms.dev/v1/responses/r1/files/b.png',
        'https://api.test.nextforms.dev/v1/responses/r1/files/gone.jpg',
    ]);
});

test('with Download Files off, a delivery is only its JSON', async () => {
    const node = new NextformsTrigger();
    const body = { id: 'r1', answers: { q2: { files: [{ id: 'a.pdf' }] } } };
    const result = await node.webhook.call({
        getBodyData: () => body,
        getNodeParameter: () => false,
        helpers: { returnJsonArray: (data) => [{ json: data }] },
    });
    assert.deepEqual(result.workflowData, [[{ json: body }]]);
});

test('the actions read forms, fields and responses', async () => {
    const node = new Nextforms();
    const calls = [];
    const ctx = {
        getInputData: () => [{ json: {} }],
        getNodeParameter: (name) =>
            ({ operation: 'getResponses', formId: 'f1', limit: 5 })[name],
        getCredentials: async () => ({
            apiKey: 'nf_test',
            baseUrl: 'https://api.test.nextforms.dev',
        }),
        helpers: {
            httpRequestWithAuthentication: async function (
                credential,
                options,
            ) {
                calls.push(options);
                return [{ id: 'r1' }, { id: 'r2' }];
            },
        },
    };
    const [out] = await node.execute.call(ctx);
    assert.equal(
        calls[0].url,
        'https://api.test.nextforms.dev/v1/forms/f1/responses',
    );
    assert.deepEqual(calls[0].qs, { limit: 5 });
    assert.deepEqual(
        out.map((o) => o.json.id),
        ['r1', 'r2'],
    );
    assert.deepEqual(
        node.description.properties[0].options.map((o) => o.value),
        ['downloadFile', 'getFields', 'getResponses', 'listForms'],
    );
});

test('Download File returns the file as binary data, under the uploaded name', async () => {
    const node = new Nextforms();
    const calls = [];
    const params = {
        operation: 'downloadFile',
        responseId: 'r1',
        fileId: 'abc.pdf',
        binaryPropertyName: 'data',
    };
    const ctx = {
        getInputData: () => [{ json: {} }],
        getNodeParameter: (name) => params[name],
        getCredentials: async () => ({
            apiKey: 'nf_test',
            baseUrl: 'https://api.test.nextforms.dev',
        }),
        helpers: {
            httpRequestWithAuthentication: async function (
                credential,
                options,
            ) {
                calls.push(options);
                return {
                    body: Buffer.from('%PDF-1.4'),
                    headers: {
                        'content-type': 'application/pdf',
                        'content-disposition':
                            'attachment; filename="My CV.pdf"; filename*=UTF-8\'\'My%20CV.pdf',
                    },
                };
            },
            prepareBinaryData: async (data, fileName, mimeType) => ({
                data: data.toString(),
                fileName,
                mimeType,
            }),
        },
    };
    const [out] = await node.execute.call(ctx);
    assert.equal(
        calls[0].url,
        'https://api.test.nextforms.dev/v1/responses/r1/files/abc.pdf',
    );
    assert.equal(calls[0].encoding, 'arraybuffer');
    assert.equal(calls[0].returnFullResponse, true);
    assert.deepEqual(out[0].json, {
        responseId: 'r1',
        fileId: 'abc.pdf',
        fileName: 'My CV.pdf',
    });
    assert.deepEqual(out[0].binary.data, {
        data: '%PDF-1.4',
        fileName: 'My CV.pdf',
        mimeType: 'application/pdf',
    });
});
