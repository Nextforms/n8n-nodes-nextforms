import type {
    IExecuteFunctions,
    IHookFunctions,
    IWebhookFunctions,
    ILoadOptionsFunctions,
    IDataObject,
    IHttpRequestMethods,
    INodePropertyOptions,
} from 'n8n-workflow';

type Ctx = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

/** One call to the Nextforms API with the credential's key and base URL. */
export async function nextformsRequest(
    ctx: Ctx,
    method: IHttpRequestMethods,
    path: string,
    body?: IDataObject,
    qs?: IDataObject,
): Promise<IDataObject | IDataObject[]> {
    const credentials = await ctx.getCredentials('nextformsApi');
    const baseUrl = String(
        credentials.baseUrl || 'https://api.nextforms.com',
    ).replace(/\/+$/, '');
    return (await ctx.helpers.httpRequestWithAuthentication.call(
        ctx,
        'nextformsApi',
        {
            method,
            url: `${baseUrl}${path}`,
            body,
            qs,
            json: true,
        },
    )) as IDataObject | IDataObject[];
}

/** A response's uploaded file: its bytes, with the name and type the API sends
 *  (Content-Disposition carries the name the respondent uploaded it with). */
export async function downloadFile(
    ctx: IExecuteFunctions | IWebhookFunctions,
    responseId: string,
    fileId: string,
): Promise<{ data: Buffer; fileName: string; mimeType: string }> {
    const credentials = await ctx.getCredentials('nextformsApi');
    const baseUrl = String(
        credentials.baseUrl || 'https://api.nextforms.com',
    ).replace(/\/+$/, '');
    const response = (await ctx.helpers.httpRequestWithAuthentication.call(
        ctx,
        'nextformsApi',
        {
            method: 'GET',
            url: `${baseUrl}/v1/responses/${encodeURIComponent(responseId)}/files/${encodeURIComponent(fileId)}`,
            encoding: 'arraybuffer',
            returnFullResponse: true,
            json: false,
        },
    )) as { body: ArrayBuffer | Buffer; headers: Record<string, string> };
    const disposition = String(response.headers['content-disposition'] ?? '');
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    const fileName = star
        ? decodeURIComponent(star[1])
        : plain
          ? plain[1]
          : fileId;
    return {
        data: Buffer.from(response.body as ArrayBuffer),
        fileName,
        mimeType: String(
            response.headers['content-type'] ?? 'application/octet-stream',
        ).split(';')[0],
    };
}

/** The team's forms, for a Form dropdown. */
export async function listForms(
    ctx: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
    const forms = (await nextformsRequest(
        ctx,
        'GET',
        '/v1/forms',
    )) as IDataObject[];
    return forms.map((form) => ({
        name: String(form.title),
        value: String(form.id),
    }));
}
