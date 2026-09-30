import type {
    IBinaryKeyData,
    IDataObject,
    ILoadOptionsFunctions,
    IHookFunctions,
    INodeType,
    INodeTypeDescription,
    IWebhookFunctions,
    IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { downloadFile, listForms, nextformsRequest } from './shared';

/**
 * "Nextforms Trigger": a REST hook. Activating the workflow registers a hook
 * subscription for the form; a Send to app step in the form's workflow then POSTs
 * each response to n8n at the point in the flow the author chose. Deactivating
 * unsubscribes. The payload is the public API's response shape (answers keyed by
 * field id, with labels) plus a `workflow` object: the step's event name and an
 * approval's outcome.
 */
export class NextformsTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Nextforms Trigger',
        name: 'nextformsTrigger',
        icon: 'file:nextforms.svg',
        group: ['trigger'],
        version: 1,
        subtitle: '=Form: {{$parameter["formId"]}}',
        description:
            'Starts when a Nextforms workflow sends a response to n8n from a Send to app step',
        defaults: { name: 'Nextforms Trigger' },
        inputs: [],
        outputs: [NodeConnectionTypes.Main],
        credentials: [{ name: 'nextformsApi', required: true }],
        webhooks: [
            {
                name: 'default',
                httpMethod: 'POST',
                responseMode: 'onReceived',
                path: 'webhook',
            },
        ],
        properties: [
            {
                displayName: 'Form Name or ID',
                name: 'formId',
                type: 'options',
                typeOptions: { loadOptionsMethod: 'getForms' },
                default: '',
                required: true,
                description:
                    'After activating, open this form\'s workflow in Nextforms and add a Send to app step that sends to this n8n workflow. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
            },
            {
                displayName: 'Download Files',
                name: 'downloadFiles',
                type: 'boolean',
                default: true,
                description:
                    'Whether to attach the files uploaded with the response as binary data (file_1, file_2, …), ready for a storage or email node',
            },
        ],
    };

    methods = {
        loadOptions: {
            async getForms(this: ILoadOptionsFunctions) {
                return listForms(this);
            },
        },
    };

    webhookMethods = {
        default: {
            async checkExists(this: IHookFunctions): Promise<boolean> {
                const data = this.getWorkflowStaticData('node');
                if (!data.hookId) {
                    return false;
                }
                try {
                    await nextformsRequest(
                        this,
                        'GET',
                        `/v1/hooks/${data.hookId}`,
                    );
                    return true;
                } catch {
                    // Gone on the Nextforms side (revoked, removed): register again.
                    delete data.hookId;
                    return false;
                }
            },
            async create(this: IHookFunctions): Promise<boolean> {
                const formId = this.getNodeParameter('formId') as string;
                const workflow = this.getWorkflow();
                const hook = (await nextformsRequest(
                    this,
                    'POST',
                    '/v1/hooks',
                    {
                        formId,
                        targetUrl: this.getNodeWebhookUrl('default'),
                        // What the Nextforms workflow editor shows in the Send to app picker.
                        label: `n8n: ${workflow.name ?? 'workflow'}`,
                    },
                )) as IDataObject;
                this.getWorkflowStaticData('node').hookId = hook.id;
                return true;
            },
            async delete(this: IHookFunctions): Promise<boolean> {
                const data = this.getWorkflowStaticData('node');
                if (data.hookId) {
                    try {
                        await nextformsRequest(
                            this,
                            'DELETE',
                            `/v1/hooks/${data.hookId}`,
                        );
                    } catch {
                        // Already gone: nothing to undo.
                    }
                    delete data.hookId;
                }
                return true;
            },
        },
    };

    async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
        const body = this.getBodyData();
        const download = this.getNodeParameter(
            'downloadFiles',
            true,
        ) as boolean;
        if (!download) {
            return {
                workflowData: [this.helpers.returnJsonArray(body)],
            };
        }
        // Every uploaded file, in form order, as binary data on the one item: file_1,
        // file_2, ... Like Gmail's "Download Attachments": the next node takes the file,
        // no second node or expression needed. A file that can't be fetched is left
        // out rather than failing the delivery; its link and id are still in the JSON.
        const binary: IBinaryKeyData = {};
        const answers = (body.answers ?? {}) as Record<string, IDataObject>;
        const responseId = String(body.id ?? '');
        for (const answer of Object.values(answers)) {
            for (const file of (answer.files ?? []) as IDataObject[]) {
                if (!file.id || !responseId) continue;
                try {
                    const got = await downloadFile(
                        this,
                        responseId,
                        String(file.id),
                    );
                    binary[`file_${Object.keys(binary).length + 1}`] =
                        await this.helpers.prepareBinaryData(
                            got.data,
                            got.fileName,
                            got.mimeType,
                        );
                } catch {
                    // Left out; see above.
                }
            }
        }
        return {
            workflowData: [
                [
                    Object.keys(binary).length
                        ? { json: body, binary }
                        : { json: body },
                ],
            ],
        };
    }
}
