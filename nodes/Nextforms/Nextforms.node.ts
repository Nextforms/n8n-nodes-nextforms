import type {
    IDataObject,
    ILoadOptionsFunctions,
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { downloadFile, listForms, nextformsRequest } from './shared';

/**
 * "Nextforms": the public API's read side as actions. List the team's forms, get a
 * form's questions, get its newest responses, download a response's file as binary
 * data. Everything a key may do; a key can never change a form or a workflow.
 */
export class Nextforms implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Nextforms',
        name: 'nextforms',
        icon: 'file:nextforms.svg',
        group: ['input'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Read forms and responses from Nextforms',
        defaults: { name: 'Nextforms' },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        credentials: [{ name: 'nextformsApi', required: true }],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Download File',
                        value: 'downloadFile',
                        action: 'Download a file uploaded with a response',
                    },
                    {
                        name: 'Get Fields',
                        value: 'getFields',
                        action: 'Get the questions of a form',
                    },
                    {
                        name: 'Get Responses',
                        value: 'getResponses',
                        action: 'Get the newest responses of a form',
                    },
                    {
                        name: 'List Forms',
                        value: 'listForms',
                        action: "List the team's forms",
                    },
                ],
                default: 'listForms',
            },
            {
                displayName: 'Form Name or ID',
                name: 'formId',
                type: 'options',
                typeOptions: { loadOptionsMethod: 'getForms' },
                default: '',
                required: true,
                displayOptions: {
                    show: { operation: ['getFields', 'getResponses'] },
                },
                description:
                    'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
            },
            {
                displayName: 'Response ID',
                name: 'responseId',
                type: 'string',
                default: '',
                required: true,
                displayOptions: { show: { operation: ['downloadFile'] } },
                description:
                    'The id of the response, from the Nextforms Trigger',
            },
            {
                displayName: 'File ID',
                name: 'fileId',
                type: 'string',
                default: '',
                required: true,
                displayOptions: { show: { operation: ['downloadFile'] } },
                description:
                    "The id of the file, from the question's files in the Nextforms Trigger. For a question with several files, use Split Out on its files first.",
            },
            {
                displayName: 'Put Output File in Field',
                name: 'binaryPropertyName',
                type: 'string',
                default: 'data',
                required: true,
                displayOptions: { show: { operation: ['downloadFile'] } },
                hint: 'The name of the output binary field to put the file in',
            },
            {
                displayName: 'Limit',
                name: 'limit',
                type: 'number',
                typeOptions: { minValue: 1, maxValue: 100 },
                default: 25,
                displayOptions: { show: { operation: ['getResponses'] } },
                description: 'Max number of results to return',
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

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];
        for (let i = 0; i < items.length; i++) {
            const operation = this.getNodeParameter('operation', i) as string;
            if (operation === 'downloadFile') {
                const responseId = this.getNodeParameter(
                    'responseId',
                    i,
                ) as string;
                const fileId = this.getNodeParameter('fileId', i) as string;
                const property = this.getNodeParameter(
                    'binaryPropertyName',
                    i,
                ) as string;
                const file = await downloadFile(this, responseId, fileId);
                out.push({
                    json: { responseId, fileId, fileName: file.fileName },
                    binary: {
                        [property]: await this.helpers.prepareBinaryData(
                            file.data,
                            file.fileName,
                            file.mimeType,
                        ),
                    },
                    pairedItem: { item: i },
                });
                continue;
            }
            let result: IDataObject | IDataObject[];
            if (operation === 'listForms') {
                result = await nextformsRequest(this, 'GET', '/v1/forms');
            } else if (operation === 'getFields') {
                const formId = this.getNodeParameter('formId', i) as string;
                result = await nextformsRequest(
                    this,
                    'GET',
                    `/v1/forms/${formId}/fields`,
                );
            } else {
                const formId = this.getNodeParameter('formId', i) as string;
                const limit = this.getNodeParameter('limit', i) as number;
                result = await nextformsRequest(
                    this,
                    'GET',
                    `/v1/forms/${formId}/responses`,
                    undefined,
                    { limit },
                );
            }
            const rows = Array.isArray(result) ? result : [result];
            out.push(
                ...rows.map((json) => ({ json, pairedItem: { item: i } })),
            );
        }
        return [out];
    }
}
