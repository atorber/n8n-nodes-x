import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class IoTCore implements INodeType {
	description: INodeTypeDescription = {
		displayName: '百度云 IoT Core',
		name: 'ioTCore',
		icon: { light: 'file:ioTCore.svg', dark: 'file:ioTCore.dark.svg' },
		group: ['transform'],
		version: 1,
		description: '百度云 IoT Core 节点，支持发送消息到 IoT Core',
		defaults: {
			name: '百度云 IoT Core',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'ioTCoreApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: '发送消息',
						value: 'sendMessage',
					},
				],
				default: 'sendMessage',
			},
			{
				displayName: 'Token 有效期（秒）',
				name: 'tokenLifeSpanInSeconds',
				type: 'number',
				default: 300,
				description: 'Token 有效期，单位：秒',
			},
			{
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				default: '$iot/ai_aihcmentor/msg',
				description: '消息主题',
				required: true,
			},
			{
				displayName: 'QoS',
				name: 'qos',
				type: 'options',
				options: [
					{
						name: '0',
						value: 0,
					},
					{
						name: '1',
						value: 1,
					},
					{
						name: '2',
						value: 2,
					},
				],
				default: 0,
				description: '消息质量等级',
			},
			{
				displayName: '消息内容',
				name: 'message',
				type: 'json',
				default: '{}',
				description: '要发送的消息内容（JSON 格式）',
				required: true,
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const credentials = await this.getCredentials('ioTCoreApi');
				const username = credentials?.username as string;
				const password = credentials?.password as string;
				const tokenLifeSpanInSeconds = this.getNodeParameter(
					'tokenLifeSpanInSeconds',
					itemIndex,
					300,
				) as number;
				const topic = this.getNodeParameter('topic', itemIndex) as string;
				const qos = this.getNodeParameter('qos', itemIndex, 0) as number;
				const message = this.getNodeParameter('message', itemIndex) as string;

				if (!username || !password) {
					throw new NodeOperationError(this.getNode(), '凭证中缺少用户名或密码', {
						itemIndex,
					});
				}

				if (operation === 'sendMessage') {
					// 步骤 1: 获取 Token
					const authUrl = 'https://afwqhkb.iot.gz.baidubce.com/auth';
					const authBody = {
						username,
						password,
						tokenLifeSpanInSeconds,
					};

					let authResponse: IDataObject;
					try {
						authResponse = (await this.helpers.httpRequest({
							method: 'POST',
							url: authUrl,
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json',
							},
							body: authBody,
							json: true,
						})) as IDataObject;
					} catch (error: unknown) {
						const errorMessage =
							error instanceof Error ? error.message : '无法连接到 IoT Core 认证服务';
						throw new NodeOperationError(this.getNode(), '获取 Token 失败', {
							itemIndex,
							description: errorMessage,
						});
					}

					const token = authResponse?.token;
					if (!token) {
						throw new NodeOperationError(this.getNode(), '获取 Token 失败：响应中未包含 token', {
							itemIndex,
						});
					}

					// 步骤 2: 发送消息
					const pubUrl = `https://afwqhkb.iot.gz.baidubce.com/pub?topic=${encodeURIComponent(
						topic,
					)}&qos=${qos}`;

					// 解析消息内容
					let messageBody: IDataObject;
					try {
						if (typeof message === 'string') {
							messageBody = JSON.parse(message);
						} else {
							messageBody = message as IDataObject;
						}
					} catch {
						throw new NodeOperationError(this.getNode(), '消息内容格式错误：必须是有效的 JSON', {
							itemIndex,
						});
					}

					let pubResponse: string | IDataObject;
					try {
						pubResponse = (await this.helpers.httpRequest({
							method: 'POST',
							url: pubUrl,
							headers: {
								token,
								Accept: 'application/json',
								'Content-Type': 'application/octet-stream',
							},
							body: JSON.stringify(messageBody),
							json: false,
						})) as string | IDataObject;
					} catch (error: unknown) {
						const errorMessage =
							error instanceof Error ? error.message : '无法发送消息到 IoT Core';
						throw new NodeOperationError(this.getNode(), '发送消息失败', {
							itemIndex,
							description: errorMessage,
						});
					}

					// 返回结果
					returnData.push({
						json: {
							success: true,
							token,
							topic,
							qos,
							message: messageBody,
							response: pubResponse,
						},
						pairedItem: {
							item: itemIndex,
						},
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: itemIndex,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

