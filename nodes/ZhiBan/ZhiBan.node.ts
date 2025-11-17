import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class ZhiBan implements INodeType {
	description: INodeTypeDescription = {
		displayName: '值班',
		name: 'zhiBan',
		icon: { light: 'file:example.svg', dark: 'file:example.dark.svg' },
		group: ['input'],
		version: 1,
		description: '值班系统节点，支持查询值班表等操作',
		defaults: {
			name: '值班',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'zhiBanApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'http://zhiban.baidu-int.com',
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
						name: '查询值班表',
						value: 'searchZhiban',
						action: '查询值班表',
						description: '查询值班表信息',
					},
				],
				default: 'searchZhiban',
			},
			{
				displayName: '日期',
				name: 'date',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['searchZhiban'],
					},
				},
				placeholder: "{{ new Date($json.timestamp).toISOString().replace('T', ' ').slice(0, 19) }}",
				description: '可选，指定查询日期。支持表达式，例如：{{ new Date($JSON.timestamp).toISOString().replace(\'T\', \' \').slice(0, 19) }}',
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
				const credentials = await this.getCredentials('zhiBanApi');
				const token = credentials?.token as string;
				const zhibanId = credentials?.zhibanId as string;

				if (!token || !zhibanId) {
					throw new NodeOperationError(
						this.getNode(),
						'凭证中缺少 Token 或值班 ID',
						{
							itemIndex,
						},
					);
				}

				let responseData: unknown;

				if (operation === 'searchZhiban') {
					// 查询值班表操作
					const date = this.getNodeParameter('date', itemIndex, '') as string;

					// 构建请求 body
					const body: IDataObject = {
						token,
						zhibanId,
					};

					// 如果提供了 date 参数，添加到 body 中
					if (date) {
						body.date = date;
					}

					const options: IHttpRequestOptions = {
						method: 'POST',
						baseURL: 'http://zhiban.baidu-int.com',
						url: '/api/open/v1/zhiban/search',
						headers: {
							'Content-Type': 'application/json',
						},
						body,
						json: true,
					};

					responseData = await this.helpers.httpRequest.call(this, options);
				} else {
					throw new NodeOperationError(this.getNode(), `未知操作: ${operation}`, {
						itemIndex,
					});
				}

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
}
