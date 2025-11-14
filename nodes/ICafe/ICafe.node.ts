import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class ICafe implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'iCafe操作',
		name: 'iCafe',
		icon: { light: 'file:icafe.svg', dark: 'file:icafe.dark.svg' },
		group: ['input'],
		version: 1,
		description: 'iCafe操作，支持查询卡片和评论卡片',
		defaults: {
			name: 'iCafe',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'iCafeApi',
				required: true,
			},
		],
		requestDefaults: {
			headers: {
				Accept: 'application/json',
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
						name: '查询卡片',
						value: 'getCards',
						action: '根据IQL查询条件获取卡片列表',
						description: '根据IQL查询条件获取卡片列表',
					},
					{
						name: '查询卡片详情',
						value: 'getCard',
						action: '根据卡片ID获取卡片详情',
						description: '根据卡片ID获取卡片详情',
					},
					{
						name: '评论卡片',
						value: 'comment',
						action: '对指定卡片添加评论',
						description: '对指定卡片添加评论',
					},
					{
						name: '解析卡片详情',
						value: 'parseCard',
						action: '卡片详情HTML转义字符解析',
						description: '卡片详情HTML转义字符解析',
					},
				],
				default: 'getCards',
			},
			{
				displayName: 'IQL查询',
				name: 'iql',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getCards'],
					},
				},
				placeholder: '输入IQL查询',
				description: 'ICafe查询语言（IQL），用于过滤卡片',
			},
			{
				displayName: '卡片ID',
				name: 'cardId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getCard', 'comment'],
					},
				},
				placeholder: '输入卡片ID',
			},
			{
				displayName: '评论内容',
				name: 'commentMsg',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['comment'],
					},
				},
				placeholder: '输入评论内容',
				description: '要添加的评论内容',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;

				let responseData: unknown;

				// 解析卡片详情操作不需要凭证
				if (operation === 'parseCard') {
					// HTML转义字符解析函数
					const htmlUnescapeEnhanced = (str: string): string => {
						return str.replace(
							/&(lt|gt|amp|quot|#39|nbsp);|&#(\d+);/g,
							(match, p1, p2) => {
								if (p1) {
									const entities: { [key: string]: string } = {
										lt: '<',
										gt: '>',
										amp: '&',
										quot: '"',
										'#39': "'",
										nbsp: ' ',
									};
									return entities[p1] || match;
								}
								if (p2) {
									// 处理数字实体（如&#60;）
									return String.fromCharCode(parseInt(p2, 10));
								}
								return match;
							},
						);
					};

					// 获取输入数据
					const inputItem = items[itemIndex];
					const inputJson = inputItem.json as IDataObject;

					// 检查数据结构
					if (!inputJson.cards || !Array.isArray(inputJson.cards)) {
						throw new NodeOperationError(
							this.getNode(),
							'输入数据格式错误：缺少cards数组',
							{
								itemIndex,
							},
						);
					}

					// 解析每个卡片
					const parsedCards: IDataObject[] = [];
					for (const card of inputJson.cards as IDataObject[]) {
						parsedCards.push({
							detail: htmlUnescapeEnhanced((card.detail as string) || ''),
							sequence: card.sequence,
							id: card.id,
							title: card.title,
							status: card.status,
							createdTime: card.createdTime,
							lastModifiedTime: card.lastModifiedTime,
							createdUser: card.createdUser,
							lastModifiedUser: card.lastModifiedUser,
							responsiblePeople: card.responsiblePeople,
							properties: card.properties,
							type: card.type,
							spaceName: card.spaceName,
							spacePrefixCode: card.spacePrefixCode,
							isFinishedStatus: card.isFinishedStatus,
						});
					}

					responseData = parsedCards;
				} else {
					// 其他操作需要凭证
					// 从凭证中获取 baseURL 和 space
					const credentials = await this.getCredentials('iCafeApi');
					const baseURL =
						(credentials?.baseURL as string) || 'http://icafeapi.baidu-int.com';
					const space = credentials?.space as string;

					if (!space) {
						throw new NodeOperationError(this.getNode(), '凭证中缺少空间标识', {
							itemIndex,
						});
					}

					if (operation === 'getCards') {
						// 查询卡片操作
						const iql = this.getNodeParameter('iql', itemIndex, '') as string;

						if (!iql) {
							throw new NodeOperationError(this.getNode(), 'IQL查询参数不能为空', {
								itemIndex,
							});
						}

						const options: IHttpRequestOptions = {
							method: 'GET',
							url: `${baseURL}/api/spaces/${space}/cards`,
							qs: {
								iql,
							},
							json: true,
						};

						responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'iCafeApi',
							options,
						);
					} else if (operation === 'getCard') {
						// 查询卡片详情操作
						const cardId = this.getNodeParameter('cardId', itemIndex, '') as string;

						if (!cardId) {
							throw new NodeOperationError(this.getNode(), '卡片ID不能为空', {
								itemIndex,
							});
						}

						const options: IHttpRequestOptions = {
							method: 'GET',
							url: `${baseURL}/api/spaces/${space}/cards/${cardId}`,
							json: true,
						};

						responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'iCafeApi',
							options,
						);
					} else if (operation === 'comment') {
						// 评论卡片操作
						const cardId = this.getNodeParameter('cardId', itemIndex, '') as string;
						const commentMsg = this.getNodeParameter('commentMsg', itemIndex, '') as string;

						if (!cardId) {
							throw new NodeOperationError(this.getNode(), '卡片ID不能为空', {
								itemIndex,
							});
						}

						if (!commentMsg) {
							throw new NodeOperationError(this.getNode(), '评论内容不能为空', {
								itemIndex,
							});
						}

						// 从凭证中获取用户名和密码
						const username = credentials?.username as string;
						const password = credentials?.password as string;

						if (!username || !password) {
							throw new NodeOperationError(
								this.getNode(),
								'凭证中缺少用户名或密码',
								{
									itemIndex,
								},
							);
						}

						const options: IHttpRequestOptions = {
							method: 'POST',
							url: `${baseURL}/api/v2/space/${space}/issue/${cardId}/comment`,
							body: {
								username,
								password,
								commentMsg,
							},
							json: true,
						};

						responseData = await this.helpers.httpRequest.call(this, options);
					} else {
						throw new NodeOperationError(this.getNode(), `未知操作: ${operation}`, {
							itemIndex,
						});
					}
				}

				// 如果响应是数组，为每个项目创建一个输出项
				if (Array.isArray(responseData)) {
					for (const item of responseData) {
						returnData.push({
							json: item as IDataObject,
							pairedItem: { item: itemIndex },
						});
					}
				} else {
					// 如果响应是对象，直接返回
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
