import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// 动态导入 SDK 以避免 lint 错误
// @ts-expect-error - @atorber/baiducloud-sdk is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports, @n8n/community-nodes/no-restricted-imports
const { BceBaseClient } = require('@atorber/baiducloud-sdk');

/**
 * 判断是否为 Job 相关接口
 */
function isJobAction(action: string): boolean {
	const jobActions = [
		'DescribeJobs',
		'CreateJob',
		'DeleteJob',
		'DescribeJob',
		'ModifyJob',
		'DescribeJobEvents',
		'DescribeJobLogs',
		'DescribePodEvents',
		'StopJob',
		'DescribeJobMetrics',
		'DescribeJobNodes',
		'DescribeJobWebterminal',
	];
	return jobActions.includes(action);
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
			resourcePoolType:'common'
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
				displayName: '资源',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'API',
						value: 'api',
					},
					{
						name: '开发实例',
						value: 'devInstance',
					},
					{
						name: '数据集',
						value: 'dataset',
					},
					{
						name: '服务',
						value: 'service',
					},
					{
						name: '模型',
						value: 'model',
					},
					{
						name: '训练任务',
						value: 'job',
					},
					{
						name: '资源池',
						value: 'resourcePool',
					},
					{
						name: '队列',
						value: 'queue',
					},
				],
				default: 'resourcePool',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeDatasets',
						action: '查询数据集列表',
					},
				],
				default: 'describeDatasets',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['devInstance'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeDevInstances',
						action: '查询开发实例列表',
					},
				],
				default: 'describeDevInstances',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['job'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeJobs',
						action: '查询训练任务列表',
						description: '查询指定资源池的训练任务列表',
					},
				],
				default: 'describeJobs',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['model'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeModels',
						action: '查询模型列表',
					},
				],
				default: 'describeModels',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['queue'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeQueues',
						action: '查询队列列表',
						description: '查询指定资源池的队列列表',
					},
				],
				default: 'describeQueues',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['resourcePool'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeResourcePools',
						action: '查询资源池列表',
						description: '查询所有资源池列表',
					},
				],
				default: 'describeResourcePools',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['service'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeServices',
						action: '查询服务列表',
					},
				],
				default: 'describeServices',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['api'],
					},
				},
				options: [
					{
						name: '调用 API',
						value: 'callApi',
						action: 'Open api',
						description: '调用百度百舸平台 OpenAPI 接口',
					},
				],
				default: 'callApi',
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
						resource: ['job'],
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
						resource: ['api'],
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
						resource: ['api'],
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
						resource: ['api'],
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
			// 数据集查询参数
			{
				displayName: '页码',
				name: 'pageNumber',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['dataset', 'model', 'devInstance', 'service', 'queue'],
					},
				},
				description: '页码，从 1 开始',
			},
			{
				displayName: '每页数量',
				name: 'pageSize',
				type: 'number',
				default: 10,
				displayOptions: {
					show: {
						resource: ['dataset', 'devInstance', 'service', 'queue'],
					},
				},
				description: '每页返回的数量',
			},
			{
				displayName: '关键词',
				name: 'keyword',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset', 'model'],
					},
				},
				description: '搜索关键词',
			},
			{
				displayName: '存储类型',
				name: 'storageType',
				type: 'options',
				options: [
					{ name: 'BOS', value: 'BOS' },
					{ name: 'PFS', value: 'PFS' },
				],
				default: 'BOS',
				displayOptions: {
					show: {
						resource: ['dataset'],
					},
				},
				description: '存储类型过滤',
			},
			{
				displayName: '存储实例',
				name: 'storageInstances',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
					},
				},
				description: '存储实例过滤',
			},
			{
				displayName: '导入格式',
				name: 'importFormat',
				type: 'options',
				options: [
					{ name: 'FILE', value: 'FILE' },
					{ name: 'FOLDER', value: 'FOLDER' },
				],
				default: 'FILE',
				displayOptions: {
					show: {
						resource: ['dataset'],
					},
				},
				description: '导入格式过滤',
			},
			// 开发实例查询参数
			{
				displayName: '仅显示我的实例',
				name: 'onlyMyDevs',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['devInstance'],
					},
				},
				description: 'Whether to show only the current user\'s development instances',
			},
			{
				displayName: '资源池 ID（开发实例）',
				name: 'devResourcePoolId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['devInstance'],
					},
				},
				description: '资源池 ID 过滤',
			},
			{
				displayName: '队列名称（开发实例）',
				name: 'devQueueName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['devInstance'],
					},
				},
				description: '队列名称过滤',
			},
			{
				displayName: '状态（开发实例）',
				name: 'devStatus',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['devInstance'],
					},
				},
				description: '状态过滤',
			},
			// 队列查询参数
			{
				displayName: '资源池 ID（队列）',
				name: 'queueResourcePoolId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['queue'],
					},
				},
				description: '资源池 ID',
			},
			{
				displayName: '关键词类型（队列）',
				name: 'queueKeywordType',
				type: 'options',
				options: [
					{ name: '队列名称', value: 'queueName' },
					{ name: '队列 ID', value: 'queueId' },
				],
				default: 'queueName',
				displayOptions: {
					show: {
						resource: ['queue'],
					},
				},
				description: '关键词搜索类型',
			},
			{
				displayName: '关键词（队列）',
				name: 'queueKeyword',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['queue'],
					},
				},
				description: '搜索关键词',
			},
			// 服务查询参数
			{
				displayName: '排序字段（服务）',
				name: 'serviceOrderBy',
				type: 'string',
				default: 'createdAt',
				displayOptions: {
					show: {
						resource: ['service'],
					},
				},
				description: '排序字段',
			},
			{
				displayName: '排序方向（服务）',
				name: 'serviceOrder',
				type: 'options',
				options: [
					{ name: '升序', value: 'asc' },
					{ name: '降序', value: 'desc' },
				],
				default: 'desc',
				displayOptions: {
					show: {
						resource: ['service'],
					},
				},
				description: '排序方向',
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

				if (operation === 'describeResourcePools') {
					// 查询资源池列表操作
					action = 'DescribeResourcePools';
					queryParams = {
						action,
						resourcePoolType:'common'
					};
					httpMethod = 'GET';
				} else if (operation === 'describeJobs') {
					// 查询训练任务列表操作
					// 根据参考脚本，DescribeJobs 需要将部分参数放在 body 中
					const resourcePoolId = this.getNodeParameter('resourcePoolId', itemIndex, '') as string;

					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池 ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeJobs';
					// queryParams 只包含 action 和 resourcePoolId
					queryParams = {
						action,
						resourcePoolId,
					};
					// body 参数（pageNumber, pageSize 等应该在 body 中，但当前实现中这些参数还没有添加）
					// 暂时使用空 body，后续可以添加更多参数
					requestBody = JSON.stringify({});
					httpMethod = 'POST';
				} else if (operation === 'describeDatasets') {
					// 查询数据集列表操作
					action = 'DescribeDatasets';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const keyword = this.getNodeParameter('keyword', itemIndex, '') as string;
					const storageType = this.getNodeParameter('storageType', itemIndex, '') as string;
					const storageInstances = this.getNodeParameter('storageInstances', itemIndex, '') as string;
					const importFormat = this.getNodeParameter('importFormat', itemIndex, '') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
						pageSize: pageSize.toString(),
					};

					if (keyword) queryParams['keyword'] = keyword;
					if (storageType) queryParams['storageType'] = storageType;
					if (storageInstances) queryParams['storageInstances'] = storageInstances;
					if (importFormat) queryParams['importFormat'] = importFormat;

					httpMethod = 'GET';
				} else if (operation === 'describeModels') {
					// 查询模型列表操作
					action = 'DescribeModels';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const keyword = this.getNodeParameter('keyword', itemIndex, '') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
					};

					if (keyword) queryParams['keyword'] = keyword;

					httpMethod = 'GET';
				} else if (operation === 'describeDevInstances') {
					// 查询开发实例列表操作
					action = 'DescribeDevInstances';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const onlyMyDevs = this.getNodeParameter('onlyMyDevs', itemIndex, false) as boolean;
					const devResourcePoolId = this.getNodeParameter('devResourcePoolId', itemIndex, '') as string;
					const devQueueName = this.getNodeParameter('devQueueName', itemIndex, '') as string;
					const devStatus = this.getNodeParameter('devStatus', itemIndex, '') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
						pageSize: pageSize.toString(),
						onlyMyDevs: onlyMyDevs ? 'true' : 'false',
					};

					if (devResourcePoolId) queryParams['resourcePoolId'] = devResourcePoolId;
					if (devQueueName) queryParams['queueName'] = devQueueName;
					if (devStatus) queryParams['status'] = devStatus;

					httpMethod = 'GET';
				} else if (operation === 'describeServices') {
					// 查询服务列表操作
					action = 'DescribeServices';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const serviceOrderBy = this.getNodeParameter('serviceOrderBy', itemIndex, 'createdAt') as string;
					const serviceOrder = this.getNodeParameter('serviceOrder', itemIndex, 'desc') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
						pageSize: pageSize.toString(),
						orderBy: serviceOrderBy,
						order: serviceOrder,
					};

					httpMethod = 'GET';
				} else if (operation === 'describeQueues') {
					// 查询队列列表操作
					action = 'DescribeQueues';
					const queueResourcePoolId = this.getNodeParameter('queueResourcePoolId', itemIndex, '') as string;
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const queueKeywordType = this.getNodeParameter('queueKeywordType', itemIndex, '') as string;
					const queueKeyword = this.getNodeParameter('queueKeyword', itemIndex, '') as string;

					if (!queueResourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池 ID 不能为空', {
							itemIndex,
						});
					}

					queryParams = {
						action,
						resourcePoolId: queueResourcePoolId,
					};

					if (queueKeywordType) queryParams['keywordType'] = queueKeywordType;
					if (queueKeyword) queryParams['keyword'] = queueKeyword;
					if (pageNumber) queryParams['pageNumber'] = pageNumber.toString();
					if (pageSize) queryParams['pageSize'] = pageSize.toString();

					httpMethod = 'GET';
				} else {
					throw new NodeOperationError(this.getNode(), `未知操作: ${operation}`, {
						itemIndex,
					});
				}

				// 构建请求头（根据参考脚本）
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
				};

				// Job 相关接口使用 X-API-Version: v2，其他接口使用 version: v2
				if (isJobAction(action)) {
					headers['X-API-Version'] = 'v2';
				} else {
					headers['version'] = 'v2';
				}

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
					response = await client.sendRequest(httpMethod, '/', {
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
	};
}
