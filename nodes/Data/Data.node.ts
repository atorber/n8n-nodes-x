/* eslint-disable n8n-nodes-base/node-param-options-type-unsorted-items */
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
		description: '数据处理节点，支持管理训练任务和数据集。',
		defaults: {
			name: '数据处理',
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
					{
						name: '任务',
						value: 'job',
					},
					{
						name: '数据集',
						value: 'dataset',
					},
				],
				default: 'job',
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
					{
						name: '查询详情',
						value: 'describeDataset',
						action: '获取数据集详情',
						description: '获取指定数据集的详细信息，包括最新版本信息',
					},
					{
						name: '查询版本列表',
						value: 'describeDatasetVersions',
						action: '获取数据集版本列表',
						description: '获取指定数据集的所有版本列表',
					},
					{
						name: '创建数据集',
						value: 'createDataset',
						action: '创建数据集',
						description: '创建数据集，同时创建一个初始版本',
					},
					{
						name: '删除数据集',
						value: 'deleteDataset',
						action: '删除数据集',
						description: '删除数据集，同时删除所有版本',
					},
					{
						name: '创建数据集版本',
						value: 'createDatasetVersion',
						action: '创建数据集版本',
					},
					{
						name: '删除数据集版本',
						value: 'deleteDatasetVersion',
						action: '删除数据集版本',
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
					{
						name: '查询详情',
						value: 'describeJob',
						action: '查询训练任务详情',
						description: '获取一个训练任务的详细信息',
					},
					{
						name: '创建任务',
						value: 'createJob',
						action: '创建训练任务',
						description: '创建一个训练任务到集群中运行',
					},
					{
						name: '停止任务',
						value: 'stopJob',
						action: '停止训练任务',
						description: '停止一个运行中的训练任务',
					},
					{
						name: '获取WebTerminal地址',
						value: 'describeJobWebterminal',
						action: 'Web terminal',
						description: '获取训练任务中指定容器的Web Terminal连接地址',
					},
					{
						name: '查询任务事件',
						value: 'describeJobEvents',
						action: '查询训练任务事件',
						description: '获取一个任务系统事件',
					},
					{
						name: '查询任务日志',
						value: 'describeJobLogs',
						action: '查询训练任务日志',
						description: '获取一个任务中某个pod的日志',
					},
					{
						name: '删除任务',
						value: 'deleteJob',
						action: '删除训练任务',
						description: '删除一个训练任务',
					},
				],
				default: 'describeJobs',
			},
			{
				displayName: '资源池ID',
				name: 'resourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobs', 'createJob'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '队列 ID',
				name: 'queueID',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认队列',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['createJob'],
					},
				},
				description: '训练任务所属队列ID，自运维资源池须填入队列名称，托管资源池须填入队列ID。如果未填写，将使用凭证中设置的默认队列',
			},
			{
				displayName: '队列名称',
				name: 'queueName',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认队列',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['createJob'],
					},
				},
				description: '训练任务所属队列名称，保持和队列ID一致即可。如果未填写，将使用凭证中设置的默认队列',
			},
			{
				displayName: '请求体参数',
				name: 'requestBody',
				type: 'json',
				default: JSON.stringify(
					{
						name: 'api-0513-2',
						queue: 'default',
						jobType: 'PyTorchJob',
						command: 'sleep 1d',
						jobSpec: {
							replicas: 1,
							image: 'registry.baidubce.com/aihc-aiak/aiak-megatron:ubuntu20.04-cu11.8-torch1.14.0-py38_v1.2.7.12_release',
							resources: [],
							envs: [
								{
									name: 'NCCL_DEBUG',
									value: 'DEBUG',
								},
								{
									name: 'NCCL_IB_DISABLE',
									value: '0',
								},
							],
							enableRDMA: true,
						},
						labels: [],
						datasource: [
							{
								type: 'pfs',
								name: 'pfs-pxE6jz',
								mountPath: '/mnt/cluster',
							},
						],
					},
					null,
					2,
				),
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['createJob'],
					},
				},
				description: '训练任务的请求体参数（JSON格式）。如果设置了资源池ID、队列ID、队列名称，将自动替换请求体中的对应值',
			},
			{
				displayName: '任务 ID',
				name: 'jobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJob'],
					},
				},
				description: '训练任务ID',
			},
			{
				displayName: '资源池ID',
				name: 'stopJobResourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['stopJob'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '任务 ID',
				name: 'stopJobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['stopJob'],
					},
				},
				description: '要停止的训练任务ID',
			},
			{
				displayName: '资源池ID',
				name: 'webterminalResourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobWebterminal'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '任务 ID',
				name: 'webterminalJobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobWebterminal'],
					},
				},
				description: '训练任务ID',
			},
			{
				displayName: '节点名称',
				name: 'podName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobWebterminal'],
					},
				},
				description: '训练任务节点名称（Pod名称）',
			},
			{
				displayName: '连接超时时间（秒）',
				name: 'handshakeTimeoutSecond',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 30,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobWebterminal'],
					},
				},
				description: '连接超时参数，仅在建立连接时使用，单位秒，默认值30，最小值1',
			},
			{
				displayName: '心跳超时时间（秒）',
				name: 'pingTimeoutSecond',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 3600,
				},
				default: 900,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobWebterminal'],
					},
				},
				description: '心跳超时参数，单位秒，默认值900，最小值1，最大值3600',
			},
			{
				displayName: '资源池ID',
				name: 'eventsResourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobEvents'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '任务 ID',
				name: 'eventsJobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobEvents'],
					},
				},
				description: '训练任务ID',
			},
			{
				displayName: '起始时间',
				name: 'startTime',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobEvents'],
					},
				},
				description: '获取任务事件的起始时间，默认为任务创建时间。格式：YYYY-MM-DD HH:MM:SS',
			},
			{
				displayName: '结束时间',
				name: 'endTime',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobEvents'],
					},
				},
				description: '获取任务事件的结束时间，默认为now。格式：YYYY-MM-DD HH:MM:SS',
			},
			{
				displayName: '资源池ID',
				name: 'logsResourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '任务 ID',
				name: 'logsJobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '训练任务ID',
			},
			{
				displayName: '节点名称',
				name: 'logsPodName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '训练任务节点名称（Pod名称）',
			},
			{
				displayName: '关键字',
				name: 'keywords',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '日志关键字查询条件，用于筛选包含指定关键字的日志',
			},
			{
				displayName: '起始时间（Unix时间戳）',
				name: 'logsStartTime',
				type: 'number',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '日志的起始时间，Unix时间戳。未设置则返回Pod从启动以来的所有日志。有效的时间范围为1970年到当前时间',
			},
			{
				displayName: '结束时间（Unix时间戳）',
				name: 'logsEndTime',
				type: 'number',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '日志的结束时间，Unix时间戳。未设置则返回Pod从启动以来的所有日志。有效的时间范围为1970年到当前时间',
			},
			{
				displayName: '最大行数',
				name: 'maxLines',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '日志的最大行数。未设置则返回Pod从启动以来的所有日志',
			},
			{
				displayName: 'Chunk大小',
				name: 'chunkSize',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 1,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '输出日志按着chunk数进行汇聚，例如将10行日志为1条记录，默认1，表示每一行日志作为1条记录',
			},
			{
				displayName: 'Marker',
				name: 'marker',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobLogs'],
					},
				},
				description: '日志查询标识符，配合返回值中的nextMarker参数使用。第一次请求不写marker参数，获取返回值，如果nextMarker字段不为空，则将nextMarker的值作为marker参数传入，获取更多的日志',
			},
			{
				displayName: '资源池ID',
				name: 'deleteJobResourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['deleteJob'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '任务 ID',
				name: 'deleteJobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['deleteJob'],
					},
				},
				description: '要删除的训练任务ID',
			},
			{
				displayName: '队列 ID',
				name: 'queueID',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJob'],
					},
				},
				description: '训练任务所属队列ID，通用资源池须填入队列名称，托管资源池须填入队列ID',
			},
			{
				displayName: '是否需要详细信息',
				name: 'needDetail',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJob'],
					},
				},
				description: 'Whether to return detailed information, including Pod and historical Pod lists when set to true',
			},
			// 数据集查询参数
			{
				displayName: '页码',
				name: 'pageNumber',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasets'],
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
						resource: ['dataset'],
						operation: ['describeDatasets'],
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
						resource: ['dataset'],
						operation: ['describeDatasets'],
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
						operation: ['describeDatasets'],
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
						operation: ['describeDatasets'],
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
						operation: ['describeDatasets'],
					},
				},
				description: '导入格式过滤',
			},
			{
				displayName: '数据集 ID',
				name: 'datasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDataset', 'describeDatasetVersions'],
					},
				},
				description: '要查询的数据集ID',
			},
			{
				displayName: '页码',
				name: 'datasetVersionPageNumber',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasetVersions'],
					},
				},
				description: '请求分页参数，表示第几页，默认值为1',
			},
			{
				displayName: '每页数量',
				name: 'datasetVersionPageSize',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasetVersions'],
					},
				},
				description: '单页结果数，不传递该参数默认返回全部（设置为0表示返回全部）',
			},
			{
				displayName: '请求体参数',
				name: 'datasetRequestBody',
				type: 'json',
				default: JSON.stringify(
					{
						name: 'test1',
						storageType: 'BOS',
						storageInstance: 'bucket1',
						importFormat: 'FOLDER',
						description: 'test dataset',
						owner: 'd1a5cf0143be4de9911342051106f70f',
						visibilityScope: 'USER_GROUP',
						visibilityUser: [
							{
								id: 'ebcf430f84b046cca9fe1c62e3d739bc',
								name: 'lisi',
								permission: 'r',
							},
							{
								id: 'f410f7b6ee5b48a7a2bd7f3675bc19e0',
								name: 'wangwu',
								permission: 'rw',
							},
						],
						initVersionEntry: {
							description: 'dataset first version',
							storagePath: '/path/to/dir',
							mountPath: '/mnt/datasets/test1',
						},
					},
					null,
					2,
				),
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['createDataset'],
					},
				},
				description: '数据集的请求体参数（JSON格式）',
			},
			{
				displayName: '数据集 ID',
				name: 'deleteDatasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['deleteDataset'],
					},
				},
				description: '要删除的数据集ID',
			},
			{
				displayName: '数据集 ID',
				name: 'createVersionDatasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['createDatasetVersion'],
					},
				},
				description: '要创建版本的数据集ID',
			},
			{
				displayName: '请求体参数',
				name: 'datasetVersionRequestBody',
				type: 'json',
				default: JSON.stringify(
					{
						description: 'new version',
						storagePath: '/path/to/version2',
						mountPath: '/mnt/datasets/my-dataset-1/v2',
					},
					null,
					2,
				),
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['createDatasetVersion'],
					},
				},
				description: '数据集版本的请求体参数（JSON格式）',
			},
			{
				displayName: '数据集 ID',
				name: 'deleteVersionDatasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['deleteDatasetVersion'],
					},
				},
				description: '要删除版本的数据集ID',
			},
			{
				displayName: '版本 ID',
				name: 'deleteVersionId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['deleteDatasetVersion'],
					},
				},
				description: '要删除的数据集版本ID',
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

		// 统一获取资源池ID的辅助函数
		const getResourcePoolId = (
			paramName: string,
			itemIndex: number,
			defaultResourcePoolId: string,
			required: boolean = true,
		): string => {
			let resourcePoolId = this.getNodeParameter(paramName, itemIndex, '') as string;

			// 如果节点参数未填写，使用凭证中的默认值
			if (!resourcePoolId && defaultResourcePoolId) {
				resourcePoolId = defaultResourcePoolId;
			}

			// 如果需要且仍为空，抛出错误
			if (required && !resourcePoolId) {
				throw new NodeOperationError(this.getNode(), '资源池ID 不能为空', {
					itemIndex,
				});
			}

			return resourcePoolId;
		};

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

				if (operation === 'describeJobs') {
					// 查询训练任务列表操作
					const resourcePoolId = getResourcePoolId('resourcePoolId', itemIndex, defaultResourcePoolId);

					action = 'DescribeJobs';
					queryParams = {
						action,
						resourcePoolId,
					};
					requestBody = JSON.stringify({});
					httpMethod = 'POST';
				} else if (operation === 'createJob') {
					// 创建训练任务操作
					const resourcePoolId = getResourcePoolId('resourcePoolId', itemIndex, defaultResourcePoolId);
					let queueID = this.getNodeParameter('queueID', itemIndex, '') as string;
					let queueName = this.getNodeParameter('queueName', itemIndex, '') as string;
					const requestBodyStr = this.getNodeParameter('requestBody', itemIndex, '{}') as string;

					// 解析请求体
					let bodyData: IDataObject = {};
					try {
						bodyData = JSON.parse(requestBodyStr) as IDataObject;
					} catch {
						throw new NodeOperationError(this.getNode(), '请求体参数格式错误，必须是有效的JSON格式', {
							itemIndex,
						});
					}

					// 如果队列ID和队列名称都未填写，使用凭证中的默认队列
					if (!queueID && !queueName && defaultQueue) {
						queueID = defaultQueue;
						queueName = defaultQueue;
					}

					const finalQueueID = queueID || queueName || (bodyData.queueID as string) || (bodyData.queue as string) || '';
					const finalQueueName = queueName || queueID || (bodyData.queue as string) || finalQueueID;

					if (!finalQueueID) {
						throw new NodeOperationError(this.getNode(), '队列ID 不能为空，请在"队列ID"字段或请求体参数中设置', {
							itemIndex,
						});
					}

					// 更新 body 中的 queue 字段，确保和 queueID 一致
					bodyData.queue = finalQueueName;
					delete bodyData.queueID;

					// 如果请求体中有 datasource 数组，且未指定 PFS 实例ID，则使用凭证中的默认值
					if (defaultPfsInstanceId && Array.isArray(bodyData.datasources)) {
						bodyData.datasources = (bodyData.datasources as IDataObject[]).map((ds: IDataObject) => {
							if (ds.type === 'pfs' && !ds.name) {
								return {
									...ds,
									name: defaultPfsInstanceId,
								};
							}
							return ds;
						});
					}

					action = 'CreateJob';
					queryParams = {
						action,
						resourcePoolId,
						queueID: finalQueueID,
					};
					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'stopJob') {
					// 停止训练任务操作
					const resourcePoolId = getResourcePoolId('stopJobResourcePoolId', itemIndex, defaultResourcePoolId);
					const jobId = this.getNodeParameter('stopJobId', itemIndex, '') as string;

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
							itemIndex,
						});
					}

					action = 'StopJob';
					queryParams = {
						action,
						resourcePoolId,
					};

					requestBody = JSON.stringify({
						jobId,
					});
					httpMethod = 'POST';
				} else if (operation === 'describeJobWebterminal') {
					// 获取训练任务WebTerminal地址操作
					const resourcePoolId = getResourcePoolId('webterminalResourcePoolId', itemIndex, defaultResourcePoolId);
					const jobId = this.getNodeParameter('webterminalJobId', itemIndex, '') as string;
					const podName = this.getNodeParameter('podName', itemIndex, '') as string;
					const handshakeTimeoutSecond = this.getNodeParameter('handshakeTimeoutSecond', itemIndex, 30) as number;
					const pingTimeoutSecond = this.getNodeParameter('pingTimeoutSecond', itemIndex, 900) as number;

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
							itemIndex,
						});
					}

					if (!podName) {
						throw new NodeOperationError(this.getNode(), '节点名称 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeJobWebterminal';
					queryParams = {
						action,
						resourcePoolId,
					};

					const bodyData: IDataObject = {
						jobId,
						podName,
					};

					if (handshakeTimeoutSecond) {
						bodyData.handshakeTimeoutSecond = handshakeTimeoutSecond.toString();
					}
					if (pingTimeoutSecond) {
						bodyData.pingTimeoutSecond = pingTimeoutSecond.toString();
					}

					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'describeJobEvents') {
					// 查询训练任务事件操作
					const resourcePoolId = getResourcePoolId('eventsResourcePoolId', itemIndex, defaultResourcePoolId);
					const jobId = this.getNodeParameter('eventsJobId', itemIndex, '') as string;
					const startTime = this.getNodeParameter('startTime', itemIndex, '') as string;
					const endTime = this.getNodeParameter('endTime', itemIndex, '') as string;

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
								itemIndex,
							});
						}

					action = 'DescribeJobEvents';
					queryParams = {
						action,
						resourcePoolId,
					};

					const bodyData: IDataObject = {
						jobId,
					};

					if (startTime) {
						bodyData.startTime = startTime;
					}
					if (endTime) {
						bodyData.endTime = endTime;
					}

					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'describeJobLogs') {
					// 查询训练任务日志操作
					const resourcePoolId = getResourcePoolId('logsResourcePoolId', itemIndex, defaultResourcePoolId);
					const jobId = this.getNodeParameter('logsJobId', itemIndex, '') as string;
					const podName = this.getNodeParameter('logsPodName', itemIndex, '') as string;
					const keywords = this.getNodeParameter('keywords', itemIndex, '') as string;
					const startTime = this.getNodeParameter('logsStartTime', itemIndex, '') as number;
					const endTime = this.getNodeParameter('logsEndTime', itemIndex, '') as number;
					const maxLines = this.getNodeParameter('maxLines', itemIndex, '') as number;
					const chunkSize = this.getNodeParameter('chunkSize', itemIndex, 1) as number;
					const marker = this.getNodeParameter('marker', itemIndex, '') as string;

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
							itemIndex,
						});
					}

					if (!podName) {
						throw new NodeOperationError(this.getNode(), '节点名称 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeJobLogs';
					queryParams = {
						action,
						resourcePoolId,
					};

					const bodyData: IDataObject = {
						jobId,
						podName,
					};

					if (keywords) {
						bodyData.keywords = keywords;
					}
					if (startTime) {
						bodyData.startTime = startTime.toString();
					}
					if (endTime) {
						bodyData.endTime = endTime.toString();
					}
					if (maxLines) {
						bodyData.maxLines = maxLines.toString();
					}
					if (chunkSize) {
						bodyData.chunkSize = chunkSize.toString();
					}
					if (marker) {
						bodyData.marker = marker;
					}

					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'deleteJob') {
					// 删除训练任务操作
					const resourcePoolId = getResourcePoolId('deleteJobResourcePoolId', itemIndex, defaultResourcePoolId);
					const jobId = this.getNodeParameter('deleteJobId', itemIndex, '') as string;

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DeleteJob';
					queryParams = {
						action,
						resourcePoolId,
					};

					requestBody = JSON.stringify({
						jobId,
					});
					httpMethod = 'POST';
				} else if (operation === 'describeJob') {
					// 查询训练任务详情操作
					const resourcePoolId = getResourcePoolId('resourcePoolId', itemIndex, defaultResourcePoolId);
					const queueID = this.getNodeParameter('queueID', itemIndex, '') as string;
					const jobId = this.getNodeParameter('jobId', itemIndex, '') as string;
					const needDetail = this.getNodeParameter('needDetail', itemIndex, false) as boolean;

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
							itemIndex,
						});
					}

					if (!queueID) {
						throw new NodeOperationError(this.getNode(), '队列ID 不能为空', {
								itemIndex,
							});
						}

					action = 'DescribeJob';
					queryParams = {
						action,
						resourcePoolId,
						queueID,
					};
					requestBody = JSON.stringify({
						jobId,
						needDetail,
					});
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
				} else if (operation === 'describeDataset') {
					// 获取数据集详情操作
					const datasetId = this.getNodeParameter('datasetId', itemIndex, '') as string;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
								itemIndex,
							});
						}

					action = 'DescribeDataset';
					queryParams = {
						action,
						datasetId,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeDatasetVersions') {
					// 获取数据集版本列表操作
					const datasetId = this.getNodeParameter('datasetId', itemIndex, '') as string;
					const pageNumber = this.getNodeParameter('datasetVersionPageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('datasetVersionPageSize', itemIndex, 0) as number;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeDatasetVersions';
					queryParams = {
						action,
						datasetId,
						pageNumber: pageNumber.toString(),
					};

					if (pageSize > 0) {
						queryParams.pageSize = pageSize.toString();
					}

					httpMethod = 'GET';
				} else if (operation === 'createDataset') {
					// 创建数据集操作
					const requestBodyStr = this.getNodeParameter('datasetRequestBody', itemIndex, '{}') as string;

					// 解析请求体
					let bodyData: IDataObject = {};
					try {
						bodyData = JSON.parse(requestBodyStr) as IDataObject;
					} catch {
						throw new NodeOperationError(this.getNode(), '请求体参数格式错误，必须是有效的JSON格式', {
							itemIndex,
						});
					}

					action = 'CreateDataset';
					queryParams = {
						action,
					};

					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'deleteDataset') {
					// 删除数据集操作
					const datasetId = this.getNodeParameter('deleteDatasetId', itemIndex, '') as string;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DeleteDataset';
					queryParams = {
						action,
						datasetId,
					};
					httpMethod = 'POST';
				} else if (operation === 'createDatasetVersion') {
					// 创建数据集版本操作
					const datasetId = this.getNodeParameter('createVersionDatasetId', itemIndex, '') as string;
					const requestBodyStr = this.getNodeParameter('datasetVersionRequestBody', itemIndex, '{}') as string;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
							itemIndex,
						});
					}

					// 解析请求体
					let bodyData: IDataObject = {};
					try {
						bodyData = JSON.parse(requestBodyStr) as IDataObject;
					} catch {
						throw new NodeOperationError(this.getNode(), '请求体参数格式错误，必须是有效的JSON格式', {
							itemIndex,
						});
					}

					action = 'CreateDatasetVersion';
					queryParams = {
						action,
						datasetId,
					};

					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'deleteDatasetVersion') {
					// 删除数据集版本操作
					const datasetId = this.getNodeParameter('deleteVersionDatasetId', itemIndex, '') as string;
					const versionId = this.getNodeParameter('deleteVersionId', itemIndex, '') as string;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
							itemIndex,
						});
					}

					if (!versionId) {
						throw new NodeOperationError(this.getNode(), '版本ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DeleteDatasetVersion';
					queryParams = {
						action,
						datasetId,
						versionId,
					};
					httpMethod = 'POST';
				} else if (operation === 'downloadHFDataset') {
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
						// @ts-expect-error - URL is a Node.js built-in global
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

					// 构建job请求体
					const bodyData: IDataObject = {
						name: `download-hf-dataset-${Date.now()}`,
						queue: finalQueueName,
						jobType: 'PyTorchJob',
						command: `pip install -q huggingface_hub && huggingface-cli download ${repoId} --local-dir /mnt/cluster/${savePath}`,
						jobSpec: {
							replicas: 1,
							image: 'registry.baidubce.com/aihc-aiak/aiak-megatron:ubuntu20.04-cu11.8-torch1.14.0-py38_v1.2.7.12_release',
							resources: [],
							envs: [],
							enableRDMA: false,
						},
						labels: [],
					};

					// 凭证中的PFS实例ID，添加到datasources
					bodyData.datasources = [
						{
							type: 'pfs',
							name: defaultPfsInstanceId,
							sourcePath: defaultPfsSourcePath,
							mountPath: '/mnt/cluster',
						},
					];

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
						// @ts-expect-error - URL is a Node.js built-in global
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

					// 构建job请求体
					const bodyData: IDataObject = {
						name: `download-hf-model-${Date.now()}`,
						queue: finalQueueName,
						jobType: 'PyTorchJob',
						command: `pip install -q huggingface_hub && huggingface-cli download ${repoId} --local-dir /mnt/cluster/${savePath}`,
						jobSpec: {
							replicas: 1,
							image: 'registry.baidubce.com/aihc-aiak/aiak-megatron:ubuntu20.04-cu11.8-torch1.14.0-py38_v1.2.7.12_release',
							resources: [],
							envs: [],
							enableRDMA: false,
						},
						labels: [],
					};

					// 如果凭证中有PFS实例ID，添加到datasource
					bodyData.datasources = [
						{
							type: 'pfs',
							name: defaultPfsInstanceId,
							sourcePath: defaultPfsSourcePath,
							mountPath: '/mnt/cluster',
						},
					];
					

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

					// 调用数据集列表查询接口进行验证
					const queryParams = {
						action: 'DescribeDatasets',
						pageNumber: '1',
						pageSize: '1',
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
