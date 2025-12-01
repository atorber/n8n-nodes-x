import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// 动态导入 SDK 以避免 lint 错误
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { BceBaseClient, HttpMethod } from '@atorber/baiducloud-sdk';
import { createHFDatasetDownloadJob } from './subJob/hfDatasetDownload';
import { createHFModelDownloadJob } from './subJob/hfModelDownload';

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
		// 使用 BceBaseClient 发送请求
		const bceConfig = {
			endpoint: baseURL,
			credentials: {
				ak: accessKey,
				sk: secretKey,
			},
		};

		const client = new BceBaseClient(bceConfig, 'aihc');

		const params = {
			action: 'DescribeResourcePools',
			resourcePoolType: 'common',
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			version: 'v2', // DescribeResourcePools 使用 version: v2
		};

		// 发送请求
		const response = await client.sendRequest('GET', '/', {
			params,
			config: {},
			headers,
		});

		// 解析响应数据
		// 根据百度百舸平台 API 响应格式，资源池列表通常在 responseData.result 或 responseData.data 中
		const responseData = response.body as IDataObject;
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

export class Data implements INodeType {
	description: INodeTypeDescription = {
		displayName: '百舸数据处理',
		name: 'data',
		icon: { light: 'file:data.svg', dark: 'file:data.dark.svg' },
		group: ['input'],
		version: 1,
		description: '数据下载节点，支持下载HF数据集和模型。',
		defaults: {
			name: '数据下载',
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
				displayName: '资源',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: '数据下载',
						value: 'dataDownload',
					},
				],
				default: 'dataDownload',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['dataDownload'],
					},
				},
				options: [
					{
						name: '下载HF数据集',
						value: 'downloadHFDataset',
						action: '下载HF数据集',
						description: '下载HF数据集到本地',
					},
					{
						name: '下载HF模型',
						value: 'downloadHFModel',
						action: '下载HF模型',
						description: '下载HF模型到本地',
					},
				],
				default: 'downloadHFDataset',
			},
			{
				displayName: 'HF数据集地址',
				name: 'hfDatasetUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://huggingface.co/datasets/username/dataset-name',
				displayOptions: {
					show: {
						resource: ['dataDownload'],
						operation: ['downloadHFDataset'],
					},
				},
				description: 'HuggingFace数据集的URL地址',
			},
			{
				displayName: 'HF模型地址',
				name: 'hfModelUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://huggingface.co/username/model-name',
				displayOptions: {
					show: {
						resource: ['dataDownload'],
						operation: ['downloadHFModel'],
					},
				},
				description: 'HuggingFace模型的URL地址',
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
				const defaultResourcePoolId = (credentials?.defaultResourcePoolId as string) || '';
				const defaultQueue = (credentials?.defaultQueue as string) || '';
				const defaultPfsInstanceId = (credentials?.defaultPfsInstanceId as string) || '';
				const defaultPfsSourcePath = (credentials?.defaultPfsSourcePath as string) || '';

				if (!accessKey || !secretKey) {
						throw new NodeOperationError(
							this.getNode(),
						'凭证中缺少 Access Key 或 Secret Key',
							{
								itemIndex,
							},
						);
					}

				// 使用 BceBaseClient 发送请求
				const bceConfig = {
					endpoint: baseURL,
					credentials: {
						ak: accessKey,
						sk: secretKey,
					},
				};

				const client = new BceBaseClient(bceConfig, 'aihc');

				let queryParams: IDataObject = {};
				let httpMethod: string;
				let requestBody: string | null = null;
				let action: string;

				if (operation === 'downloadHFDataset') {
					// 下载HF数据集操作
					const hfUrl = this.getNodeParameter('hfDatasetUrl', itemIndex, '') as string;

					if (!hfUrl) {
						throw new NodeOperationError(this.getNode(), 'HF数据集地址 不能为空', {
							itemIndex,
						});
					}

					// 解析URL，去掉https://，得到路径
					let repoId = '';
				let savePath = '';
				try {
					const url = new URL(hfUrl);
						const pathname = url.pathname;
						// 去掉开头的斜杠，得到repo_id
						repoId = pathname.startsWith('/') ? pathname.substring(1) : pathname;
						// 保存路径就是去掉https://之后的路径
						savePath = repoId;
					} catch {
						// 如果URL解析失败，尝试简单提取
						const match = hfUrl.match(/https?:\/\/[^/]+(\/.*)/);
						if (match && match[1]) {
							repoId = match[1].substring(1);
							savePath = repoId;
						} else {
							throw new NodeOperationError(this.getNode(), '无效的HF数据集URL地址', {
							itemIndex,
						});
					}
					}

					// 使用凭证中的默认值创建job
					const resourcePoolId = defaultResourcePoolId || '';
					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空，请在凭证中设置默认资源池ID', {
							itemIndex,
						});
					}
					const finalQueueID = defaultQueue || 'default';
					const finalQueueName = defaultQueue || 'default';

					// 使用模板函数获取操作特定配置（使用默认值）
					const jobTemplate = createHFDatasetDownloadJob(repoId, savePath);

					// 构建完整的job请求体，补充公共参数
					const bodyData: IDataObject = {
						name: jobTemplate.jobName,
						queue: finalQueueName,
						jobType: 'PyTorchJob',
						command: jobTemplate.command,
						jobSpec: {
							replicas: 1,
							image: jobTemplate.image,
							resources: [],
							envs: [],
							enableRDMA: false,
						},
						labels: [],
					};

					// 如果凭证中有PFS实例ID，添加到datasources
					if (defaultPfsInstanceId) {
						bodyData.datasources = [
							{
								type: 'pfs',
								name: defaultPfsInstanceId,
								sourcePath: defaultPfsSourcePath || '',
								mountPath: '/mnt/cluster',
							},
						];
					}

					action = 'CreateJob';
					queryParams = {
						action,
						resourcePoolId,
						queueID: finalQueueID,
					};
					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'downloadHFModel') {
					// 下载HF模型操作
					const hfUrl = this.getNodeParameter('hfModelUrl', itemIndex, '') as string;

					if (!hfUrl) {
						throw new NodeOperationError(this.getNode(), 'HF模型地址 不能为空', {
							itemIndex,
						});
					}

					// 解析URL，去掉https://，得到路径
					let repoId = '';
				let savePath = '';
				try {
					const url = new URL(hfUrl);
						const pathname = url.pathname;
						// 去掉开头的斜杠，得到repo_id
						repoId = pathname.startsWith('/') ? pathname.substring(1) : pathname;
						// 保存路径就是去掉https://之后的路径
						savePath = repoId;
					} catch {
						// 如果URL解析失败，尝试简单提取
						const match = hfUrl.match(/https?:\/\/[^/]+(\/.*)/);
						if (match && match[1]) {
							repoId = match[1].substring(1);
							savePath = repoId;
						} else {
							throw new NodeOperationError(this.getNode(), '无效的HF模型URL地址', {
							itemIndex,
						});
					}
					}

					// 使用凭证中的默认值创建job
					const resourcePoolId = defaultResourcePoolId || '';
					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空，请在凭证中设置默认资源池ID', {
							itemIndex,
						});
					}
					const finalQueueID = defaultQueue || 'default';
					const finalQueueName = defaultQueue || 'default';

					// 使用模板函数获取操作特定配置（使用默认值）
					const jobTemplate = createHFModelDownloadJob(repoId, savePath);

					// 构建完整的job请求体，补充公共参数
					const bodyData: IDataObject = {
						name: jobTemplate.jobName,
						queue: finalQueueName,
						jobType: 'PyTorchJob',
						command: jobTemplate.command,
						jobSpec: {
							replicas: 1,
							image: jobTemplate.image,
							resources: [],
							envs: [],
							enableRDMA: false,
						},
						labels: [],
					};

					// 如果凭证中有PFS实例ID，添加到datasources
					if (defaultPfsInstanceId) {
						bodyData.datasources = [
							{
								type: 'pfs',
								name: defaultPfsInstanceId,
								sourcePath: defaultPfsSourcePath || '',
								mountPath: '/mnt/cluster',
							},
						];
					}

					action = 'CreateJob';
					queryParams = {
						action,
						resourcePoolId,
						queueID: finalQueueID,
					};
					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
					} else {
						throw new NodeOperationError(this.getNode(), `未知操作: ${operation}`, {
							itemIndex,
						});
					}

				// 构建请求头（根据参考脚本）
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
				};

				// Job 相关接口使用 X-API-Version: v2
					headers['X-API-Version'] = 'v2';

				// 发送请求
				let response;
				if (httpMethod === 'POST' || httpMethod === 'PUT') {
					response = await client.sendRequest(httpMethod, '/', {
						params: queryParams,
						config: {},
						headers,
						body: requestBody || null,
					});
				} else {
					response = await client.sendRequest(httpMethod as HttpMethod, '/', {
						params: queryParams,
						config: {},
						headers,
					});
				}

				// 解析响应数据
				const responseData = response.body;
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
		credentialTest: {
			async aihcApi(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const accessKey = credential.data?.accessKey as string;
				const secretKey = credential.data?.secretKey as string;
				const baseURL = (credential.data?.baseURL as string) || 'http://aihc.bj.baidubce.com';

				if (!accessKey || !secretKey) {
					return {
						status: 'Error',
						message: '凭证中缺少 Access Key 或 Secret Key',
					};
				}

				try {
					// 使用 BceBaseClient 发送请求
					const bceConfig = {
						endpoint: baseURL,
						credentials: {
							ak: accessKey,
							sk: secretKey,
						},
					};

					const client = new BceBaseClient(bceConfig, 'aihc');

					// 调用资源池列表查询接口进行验证
					const queryParams = {
						action: 'DescribeResourcePools',
						resourcePoolType: 'common',
					};

					const headers: Record<string, string> = {
						'Content-Type': 'application/json',
						version: 'v2',
					};

					const response = await client.sendRequest('GET', '/', {
						params: queryParams,
						config: {},
						headers,
					});

					// 检查响应是否成功
					if (response.body && typeof response.body === 'object') {
						// 如果响应包含错误信息，返回错误
						if ('code' in response.body && response.body.code) {
							return {
								status: 'Error',
								message: `API 请求失败: ${response.body.code} - ${response.body.message || '未知错误'}`,
							};
						}
						// 验证成功
						return {
							status: 'OK',
							message: '凭证验证成功',
						};
					}

					return {
						status: 'Error',
						message: '无效的 API 响应',
					};
				} catch (error) {
					// 提供更详细的错误信息
					let errorMessage = '凭证验证失败';
					if (error instanceof Error) {
						errorMessage = `${errorMessage}: ${error.message}`;
					} else {
						errorMessage = `${errorMessage}: ${String(error)}`;
					}
					
					return {
						status: 'Error',
						message: errorMessage,
					};
				}
			},
		},
	};
}
