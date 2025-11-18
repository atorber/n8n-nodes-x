/**
 * 创建HF模型下载Job模板
 * 只包含操作特定的参数（image、command、jobName），其他公共参数由调用方补充
 * @param repoId - HuggingFace模型repo ID（例如：username/model-name）
 * @param savePath - 保存路径（去掉https://之后的路径）
 * @param options - 可选配置项（仅包含操作特定参数）
 * @returns Job请求体基础配置（不包含公共参数）
 */
export function createHFModelDownloadJob(
	repoId: string,
	savePath: string,
	options: {
		image?: string;
		command?: string;
		jobName?: string;
	} = {},
): {
	image: string;
	command: string;
	jobName: string;
} {
	const {
		image = 'registry.baidubce.com/aihc-aiak/aiak-megatron:ubuntu20.04-cu11.8-torch1.14.0-py38_v1.2.7.12_release',
		command = `pip install -q huggingface_hub && huggingface-cli download ${repoId} --local-dir /mnt/cluster/${savePath}`,
		jobName = `download-hf-model-${Date.now()}`,
	} = options;

	return {
		image,
		command,
		jobName,
	};
}

