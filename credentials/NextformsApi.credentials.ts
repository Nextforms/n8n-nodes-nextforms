import type {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

/**
 * A team API key from Nextforms (Settings → Connected apps → Create key), sent as a
 * bearer token. Keys belong to the team, so a workflow keeps running when the person
 * who made it leaves. The base URL is for a self-hosted or staging Nextforms.
 */
export class NextformsApi implements ICredentialType {
    name = 'nextformsApi';
    displayName = 'Nextforms API';
    documentationUrl = 'https://nextforms.com/docs/n8n/';

    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            required: true,
            description:
                'Create one under Settings → Connected apps. It needs forms:read, responses:read and, for the trigger, hooks:manage.',
        },
        {
            displayName: 'Base URL',
            name: 'baseUrl',
            type: 'string',
            default: 'https://api.nextforms.com',
            description:
                'Only change this for a self-hosted or staging Nextforms.',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '=Bearer {{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.baseUrl}}',
            url: '/v1/me',
        },
    };
}
