import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
	INodeExecutionData,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import mqtt, { MqttClient } from 'mqtt';

export class IoTCoreTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: '百度云 IoT Core Trigger',
		name: 'ioTCoreTrigger',
		icon: { light: 'file:ioTCoreTrigger.svg', dark: 'file:ioTCoreTrigger.dark.svg' },
		group: ['trigger'],
		version: 1,
		description: '百度云 IoT Core 触发器，订阅 IoT Core MQTT 主题并触发工作流',
		defaults: {
			name: '百度云 IoT Core Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'ioTCoreApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'IoT Core MQTT 服务器地址',
				name: 'brokerUrl',
				type: 'string',
				default: 'mqtt://afwqhkb.iot.gz.baidubce.com:1883',
				description: '百度云 IoT Core MQTT 服务器地址，格式：mqtt://host:port',
				required: true,
			},
			{
				displayName: '主题 (Topic)',
				name: 'topic',
				type: 'string',
				default: '$iot/ai_aihcmentor/msg',
				description: '要订阅的 MQTT 主题',
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
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const brokerUrl = this.getNodeParameter('brokerUrl') as string;
		const topic = this.getNodeParameter('topic') as string;
		const qos = (this.getNodeParameter('qos') as number) || 0;

		const credentials = await this.getCredentials('ioTCoreApi');
		const username = credentials?.username as string;
		const password = credentials?.password as string;

		if (!username || !password) {
			throw new Error('凭证中缺少用户名或密码');
		}

		const clientId = `n8n_${Date.now()}_${Math.random().toString(36).substring(7)}`;

		const client: MqttClient = mqtt.connect(brokerUrl, {
			clientId,
			username,
			password,
			clean: true,
			reconnectPeriod: 1000,
		});

		const activate = async () => {
			return new Promise<void>((resolve, reject) => {
				client.on('connect', () => {
					this.logger.info(`MQTT 客户端已连接到 ${brokerUrl}`);
					client.subscribe(topic, { qos: qos as 0 | 1 | 2 }, (error) => {
						if (error) {
							this.logger.error(`订阅主题失败: ${error.message}`);
							reject(error);
							return;
						}
						this.logger.info(`已订阅主题: ${topic} (QoS: ${qos})`);
						resolve();
					});
				});

				client.on('message', (receivedTopic, message) => {
					if (receivedTopic === topic) {
						try {
							// 尝试解析 JSON
							let jsonData: IDataObject;
							try {
								jsonData = JSON.parse(message.toString()) as IDataObject;
							} catch {
								// 如果不是 JSON，则作为字符串返回
								jsonData = {
									raw: message.toString(),
									topic: receivedTopic,
								};
							}

							// 触发工作流
							const executionData: INodeExecutionData[][] = [
								[
									{
										json: {
											...jsonData,
											topic: receivedTopic,
											timestamp: new Date().toISOString(),
										},
									},
								],
							];
							this.emit(executionData);
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error);
							this.logger.error(`处理消息时出错: ${errorMessage}`);
						}
					}
				});

				client.on('error', (error) => {
					this.logger.error(`MQTT 错误: ${error.message}`);
					reject(error);
				});

				client.on('close', () => {
					this.logger.info('MQTT 连接已关闭');
				});

				client.on('offline', () => {
					this.logger.warn('MQTT 客户端已离线');
				});
			});
		};

		const deactivate = async () => {
			return new Promise<void>((resolve) => {
				if (client) {
					client.end(false, {}, () => {
						this.logger.info('MQTT 客户端已断开连接');
						resolve();
					});
				} else {
					resolve();
				}
			});
		};

		await activate();

		return {
			close: async () => {
				await deactivate();
			},
		} as ITriggerResponse;
	}
}

