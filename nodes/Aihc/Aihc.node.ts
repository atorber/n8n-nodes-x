import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// @ts-expect-error - crypto is a Node.js built-in module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require('crypto');

/**
 * 获取规范时间格式
 * 格式：YYYY-MM-DDTHH:MM:SSZ
 */
function getCanonicalTime(): string {
	const now = new Date();
	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	const day = String(now.getUTCDate()).padStart(2, '0');
	const hour = String(now.getUTCHours()).padStart(2, '0');
	const minute = String(now.getUTCMinutes()).padStart(2, '0');
	const second = String(now.getUTCSeconds()).padStart(2, '0');
	return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

/**
 * 规范化 URI
 * 根据 Python 脚本：urllib.parse.quote(uri, safe='-_.~/')
 */
function normalizedUri(uri: string): string {
	// 对 URI 进行编码，但保留安全字符：-_.~/
	// encodeURIComponent 会编码所有字符，我们需要手动处理
	let result = '';
	for (let i = 0; i < uri.length; i++) {
		const char = uri[i];
		if (/[-_.~/]/.test(char)) {
			result += char;
		} else {
			result += encodeURIComponent(char);
		}
	}
	return result;
}

/**
 * 规范化字符串
 */
function normalized(msg: string): string {
	return encodeURIComponent(msg).replace(/%20/g, '+');
}

/**
 * 规范化查询字符串
 * 排除 authorization 参数，对 key 和 value 进行编码
 */
function canonicalQs(params: IDataObject): string {
	const keys = Object.keys(params).filter((key) => key !== 'authorization').sort();
	const pairs: string[] = [];
	for (const key of keys) {
		const val = normalized(String(params[key]));
		const encodedKey = encodeURIComponent(key).replace(/[!'()*]/g, (c) => {
			return '%' + c.charCodeAt(0).toString(16).toUpperCase();
		});
		pairs.push(`${encodedKey}=${val}`);
	}
	return pairs.join('&');
}

/**
 * 规范化请求头字符串
 */
function canonicalHeaderStr(headers: IDataObject, signedHeaders?: string[]): string {
	const headersNormLower: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) {
		const keyNormLower = normalized(k.toLowerCase());
		const valueNormLower = normalized(String(v).trim());
		headersNormLower[keyNormLower] = valueNormLower;
	}

	const keys = Object.keys(headersNormLower).sort();
	if (!keys.includes('host')) {
		throw new NodeOperationError(
			// @ts-expect-error - This is a utility function, not a node execution context
			null,
			'Host header is required',
		);
	}

	const headerList: string[] = [];
	const defaultSigned = ['host', 'content-length', 'content-type', 'content-md5'];

		if (signedHeaders) {
			for (const key of signedHeaders) {
				const keyNorm = normalized(key.toLowerCase());
				if (!keys.includes(keyNorm)) {
					throw new NodeOperationError(
						// @ts-expect-error - This is a utility function, not a node execution context
						null,
						`Header ${key} not found`,
					);
				}
			if (headersNormLower[keyNorm]) {
				headerList.push(`${keyNorm}:${headersNormLower[keyNorm]}`);
			}
		}
	} else {
		for (const key of keys) {
			if (key.startsWith('x-bce-') || defaultSigned.includes(key)) {
				headerList.push(`${key}:${headersNormLower[key]}`);
			}
		}
	}

	return headerList.join('\n');
}

/**
 * 计算签名密钥
 */
function calcSigningKey(auth: {
	version: string;
	access: string;
	timestamp: string;
	period: string;
}, secretKey: string): string {
	const stringToSign = `${auth.version}/${auth.access}/${auth.timestamp}/${auth.period}`;
	return crypto.createHmac('sha256', secretKey).update(stringToSign, 'utf-8').digest('hex');
}

/**
 * 计算签名
 */
function calcSignature(
	signingKey: string,
	method: string,
	uri: string,
	params: IDataObject,
	headers: IDataObject,
	signedHeaders: string[],
): string {
	const canonicalRequest = [
		method.toUpperCase(),
		normalizedUri(uri),
		canonicalQs(params),
		canonicalHeaderStr(headers, signedHeaders),
	].join('\n');

	// signingKey 是 hex 字符串，需要转换为 Buffer
	// @ts-expect-error - Buffer is a Node.js built-in
	const signingKeyBuffer = Buffer.from(signingKey, 'hex');
	return crypto
		.createHmac('sha256', signingKeyBuffer)
		.update(canonicalRequest, 'utf-8')
		.digest('hex');
}

/**
 * 生成百度百舸平台签名
 * 签名鉴权文档参考：https://cloud.baidu.com/doc/AIHC/s/4maz04s1c
 * 根据百度百舸平台官方签名算法实现
 */
function generateBaiduCloudSignature(
	method: string,
	uri: string,
	params: IDataObject,
	headers: IDataObject,
	accessKey: string,
	secretKey: string,
): string {
	const timestamp = getCanonicalTime();
	const period = '1800';

	// 获取需要签名的请求头
	const signedHeaders = Object.keys(headers)
		.map((key) => key.toLowerCase())
		.filter((key) => key !== '')
		.sort();

	// 构建授权对象
	const auth = {
		version: 'bce-auth-v1',
		access: accessKey,
		timestamp,
		period,
		signedHeaders,
	};

	// 计算签名密钥
	const signingKey = calcSigningKey(auth, secretKey);

	// 计算签名
	const signature = calcSignature(signingKey, method, uri, params, headers, signedHeaders);

	// 序列化授权字符串
	return `${auth.version}/${auth.access}/${auth.timestamp}/${auth.period}/${signedHeaders.join(';')}/${signature}`;
}

/**
 * 获取资源池列表
 * 用于下拉选项
 */
async function getResourcePools(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const credentials = await this.getCredentials('aihcApi');
	const accessKey = credentials?.accessKey as string;
	const secretKey = credentials?.secretKey as string;
	const baseURL = (credentials?.baseURL as string) || 'http://aihc.bj.baidubce.com';

	if (!accessKey || !secretKey) {
		return { results: [] };
	}

	try {
		// 构建 DescribeResourcePools API 请求
		// @ts-expect-error - URL is a Node.js built-in
		const domain = new URL(baseURL).hostname;
		const uri = '/';
		const queryParams: IDataObject = {
			action: 'DescribeResourcePools',
		};
		const httpMethod = 'GET';

		// 构建请求头
		const canonicalTime = getCanonicalTime();
		const headers: IDataObject = {
			'x-bce-date': canonicalTime,
			'Content-Type': 'application/json',
			Host: domain,
			'X-API-VERSION': 'v2',
		};

		// 生成签名
		const authorization = generateBaiduCloudSignature(
			httpMethod,
			uri,
			queryParams,
			headers,
			accessKey,
			secretKey,
		);

		// 添加 Authorization 头
		headers.Authorization = authorization;

		// 构建请求选项
		const options: IHttpRequestOptions = {
			method: 'GET',
			url: baseURL,
			headers: headers as Record<string, string>,
			qs: queryParams,
			json: true,
		};

		// 发送请求
		const responseData = (await this.helpers.httpRequest.call(this, options)) as IDataObject;

		// 解析响应数据
		// 根据百度百舸平台 API 响应格式，资源池列表通常在 responseData.result 或 responseData.data 中
		let resourcePools: IDataObject[] = [];
		if (Array.isArray(responseData)) {
			resourcePools = responseData;
		} else if (responseData.result && Array.isArray(responseData.result)) {
			resourcePools = responseData.result as IDataObject[];
		} else if (responseData.data && Array.isArray(responseData.data)) {
			resourcePools = responseData.data as IDataObject[];
		} else if (responseData.resourcePools && Array.isArray(responseData.resourcePools)) {
			resourcePools = responseData.resourcePools as IDataObject[];
		}

		// 转换为下拉选项格式
		const results: INodeListSearchItems[] = [];
		for (const pool of resourcePools) {
			// 尝试多种可能的字段名
			const id = String(pool.id || pool.resourcePoolId || pool.poolId || pool.name || '');
			const name = String(pool.name || pool.resourcePoolName || pool.poolName || id || '');

			if (id) {
				results.push({
					name: `${name} (${id})`,
					value: id,
				});
			}
		}

		// 如果提供了过滤条件，进行过滤
		if (filter) {
			const lowerFilter = filter.toLowerCase();
			return {
				results: results.filter(
					(item) =>
						item.name.toLowerCase().includes(lowerFilter) ||
						String(item.value).toLowerCase().includes(lowerFilter),
				),
			};
		}

		return { results };
	} catch {
		// 如果请求失败，返回空列表
		return { results: [] };
	}
}

export class Aihc implements INodeType {
	description: INodeTypeDescription = {
		displayName: '百度百舸平台',
		name: 'aihc',
		icon: { light: 'file:aihc.svg', dark: 'file:aihc.dark.svg' },
		group: ['input'],
		version: 1,
		description:
			'百度百舸平台 OpenAPI 节点，使用百度云 AK/SK 进行鉴权。支持查询训练任务列表等操作。签名鉴权文档：https://cloud.baidu.com/doc/AIHC/s/4maz04s1c，查询训练任务文档：https://cloud.baidu.com/doc/AIHC/s/xmayvctia',
		defaults: {
			name: '百度百舸平台',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'aihcApi',
				required: true,
			},
		],
		requestDefaults: {
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: '查询资源池列表',
						value: 'describeResourcePools',
						action: '查询资源池列表',
						description: '查询所有资源池列表',
					},
					{
						name: '查询训练任务列表',
						value: 'describeJobs',
						action: '查询训练任务列表',
						description: '查询指定资源池的训练任务列表',
					},
					{
						name: '调用 API',
						value: 'callApi',
						action: 'Open api',
						description: '调用百度百舸平台 OpenAPI 接口',
					},
				],
				default: 'describeResourcePools',
			},
			{
				displayName: '资源池 ID',
				name: 'resourcePoolId',
				type: 'options',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['describeJobs'],
					},
				},
				description: '从下拉列表中选择资源池，或输入资源池 ID',
			},
			{
				displayName: 'API URL 或路径',
				name: 'apiPath',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'http://aihc.bj.baidubce.com/?action=DescribeJobs&resourcePoolId=xxx',
				description:
					'完整的 API URL（包含查询参数）或 API 路径。例如：http://aihc.bj.baidubce.com/?action=DescribeJobs&resourcePoolId=xxx',
				displayOptions: {
					show: {
						operation: ['callApi'],
					},
				},
			},
			{
				displayName: 'HTTP 方法',
				name: 'httpMethod',
				type: 'options',
				options: [
					{
						name: 'GET',
						value: 'GET',
					},
					{
						name: 'POST',
						value: 'POST',
					},
					{
						name: 'PUT',
						value: 'PUT',
					},
					{
						name: 'DELETE',
						value: 'DELETE',
					},
				],
				default: 'GET',
				required: true,
				displayOptions: {
					show: {
						operation: ['callApi'],
					},
				},
			},
			{
				displayName: '查询参数',
				name: 'queryParameters',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'key1=value1&key2=value2',
				description:
					'URL 查询参数，格式：key1=value1&key2=value2。如果 API URL 中已包含查询参数，此项可为空',
				displayOptions: {
					show: {
						operation: ['callApi'],
					},
				},
			},
			{
				displayName: '请求体',
				name: 'requestBody',
				type: 'json',
				default: '',
				displayOptions: {
					show: {
						httpMethod: ['POST', 'PUT'],
					},
				},
				description: '请求体内容（JSON 格式）',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;

				// 获取凭证
				const credentials = await this.getCredentials('aihcApi');
				const accessKey = credentials?.accessKey as string;
				const secretKey = credentials?.secretKey as string;
				const baseURL = (credentials?.baseURL as string) || 'http://aihc.bj.baidubce.com';

				if (!accessKey || !secretKey) {
					throw new NodeOperationError(
						this.getNode(),
						'凭证中缺少 Access Key 或 Secret Key',
						{
							itemIndex,
						},
					);
				}

				let url: string;
				let uri: string;
				let domain: string;
				let queryParams: IDataObject = {};
				let httpMethod: string;
				let requestBody: IDataObject | undefined;

				if (operation === 'describeResourcePools') {
					// 查询资源池列表操作
					// action=DescribeResourcePools 是固定的，使用 GET 方法
					// @ts-expect-error - URL is a Node.js built-in
					domain = new URL(baseURL).hostname;
					uri = '/';
					queryParams = {
						action: 'DescribeResourcePools', // 固定值，不可修改
					};
					httpMethod = 'GET';
					url = baseURL;
				} else if (operation === 'describeJobs') {
					// 查询训练任务列表操作
					// 参考文档：https://cloud.baidu.com/doc/AIHC/s/xmayvctia
					const resourcePoolId = this.getNodeParameter('resourcePoolId', itemIndex, '') as string;

					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池 ID 不能为空', {
							itemIndex,
						});
					}

					// 构建 DescribeJobs API 请求
					// action=DescribeJobs 是固定的，不能修改
					// @ts-expect-error - URL is a Node.js built-in
					domain = new URL(baseURL).hostname;
					uri = '/';
					queryParams = {
						action: 'DescribeJobs', // 固定值，不可修改
						resourcePoolId,
					};
					httpMethod = 'POST';
					url = baseURL;
				} else if (operation === 'callApi') {
					// 通用 API 调用操作
					const apiPathOrUrl = this.getNodeParameter('apiPath', itemIndex, '') as string;
					httpMethod = this.getNodeParameter('httpMethod', itemIndex, 'GET') as string;
					const queryParametersStr = this.getNodeParameter('queryParameters', itemIndex, '') as string;
					const requestBodyStr = this.getNodeParameter('requestBody', itemIndex, '') as string;

					if (!apiPathOrUrl) {
						throw new NodeOperationError(this.getNode(), 'API URL 或路径不能为空', {
							itemIndex,
						});
					}

					// 解析 URL 或路径
					if (apiPathOrUrl.startsWith('http://') || apiPathOrUrl.startsWith('https://')) {
						// 完整 URL
						url = apiPathOrUrl;
						try {
							// @ts-expect-error - URL is a Node.js built-in
							const urlObj = new URL(apiPathOrUrl);
							domain = urlObj.hostname;
							uri = urlObj.pathname;
							// 解析 URL 中的查询参数
							urlObj.searchParams.forEach((value: string, key: string) => {
								queryParams[key] = value;
							});
						} catch {
							throw new NodeOperationError(this.getNode(), `无效的 URL: ${apiPathOrUrl}`, {
								itemIndex,
							});
						}
					} else {
						// 仅路径，需要拼接 baseURL
						uri = apiPathOrUrl.split('?')[0];
						// @ts-expect-error - URL is a Node.js built-in
						domain = new URL(baseURL).hostname;
						url = `${baseURL}${apiPathOrUrl}`;
						// 解析路径中的查询参数
						if (apiPathOrUrl.includes('?')) {
							const queryString = apiPathOrUrl.split('?')[1];
							const params = queryString.split('&');
							for (const param of params) {
								const [key, value] = param.split('=');
								if (key) {
									queryParams[key] = decodeURIComponent(value || '');
								}
							}
						}
					}

					// 解析额外的查询参数（如果提供）
					if (queryParametersStr) {
						const params = queryParametersStr.split('&');
						for (const param of params) {
							const [key, value] = param.split('=');
							if (key) {
								queryParams[key] = decodeURIComponent(value || '');
							}
						}
					}

					// 解析请求体
					if (requestBodyStr && (httpMethod === 'POST' || httpMethod === 'PUT')) {
						try {
							requestBody = JSON.parse(requestBodyStr) as IDataObject;
						} catch {
							throw new NodeOperationError(
								this.getNode(),
								'请求体格式错误，必须是有效的 JSON 格式',
								{
									itemIndex,
								},
							);
						}
					}
				} else {
					throw new NodeOperationError(this.getNode(), `未知操作: ${operation}`, {
						itemIndex,
					});
				}

				// 构建请求头（根据 Python 脚本）
				const canonicalTime = getCanonicalTime();
				const headers: IDataObject = {
					'x-bce-date': canonicalTime,
					'Content-Type': 'application/json',
					Host: domain,
					'X-API-VERSION': 'v2',
				};

				// 生成签名
				const authorization = generateBaiduCloudSignature(
					httpMethod,
					uri,
					queryParams,
					headers,
					accessKey,
					secretKey,
				);

				// 添加 Authorization 头
				headers.Authorization = authorization;

				// 构建请求选项
				const options: IHttpRequestOptions = {
					method: httpMethod as 'GET' | 'POST' | 'PUT' | 'DELETE',
					url: url,
					headers: headers as Record<string, string>,
					qs: queryParams,
					json: true,
				};

				if (requestBody) {
					options.body = requestBody;
				}

				// 发送请求
				const responseData = await this.helpers.httpRequest.call(this, options);

				// 处理响应
				if (Array.isArray(responseData)) {
					for (const item of responseData) {
						returnData.push({
							json: item as IDataObject,
							pairedItem: { item: itemIndex },
						});
					}
				} else {
					returnData.push({
						json: responseData as IDataObject,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: this.getInputData(itemIndex)[0].json,
						error,
						pairedItem: { item: itemIndex },
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}

	methods = {
		listSearch: {
			getResourcePools,
		},
	};
}
