#!/usr/bin/env node
/** Deep Research CLI: workflow operations and research tools. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeClient } from '../../Contract/node-client.mjs';
import { ENGINE_ID } from './model.mjs';

const usage = `Deep Research 2.0 — Multi-Agent Research Engine

Workflow commands (保留 request key 重试时使用):
  start --topic "研究主题" --request-id KEY [--scope comprehensive]
  start --input @input.json --request-id KEY
  list
  get --id WORKFLOW_ID
  respond --id ID --revision N --action approve-plan --request-id KEY
  resume --id ID --revision N --request-id KEY
  cancel --id ID
  download --id ID --output report.html

Research scope:
  quick         — 快速概览
  comprehensive — 全面调查（默认）
  deep          — 深度分析
  academic      — 学术研究

任务规模与耗时由初步调研和动态计划确定；范围不代表固定完成时间。

Examples:
  # 开始新研究
  node cli.mjs start --topic "AI 在医疗诊断中的应用" --request-id req-001

  # 快速研究
  node cli.mjs start --topic "2024 年 AI 发展趋势" --scope quick --request-id req-002

  # 从 JSON 输入
  node cli.mjs start --input @research-input.json --request-id req-003

  # 查看进度
  node cli.mjs get --id WORKFLOW_ID

  # 批准研究计划
  node cli.mjs respond --id WORKFLOW_ID --revision 1 --action approve-plan --request-id req-004

  # 下载报告
  node cli.mjs download --id WORKFLOW_ID --output final-report.html

Engine guide: README.md
Workflow protocol: ../../Contract/WORKFLOWS.md
`;

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--') || i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      throw Error('参数无效：' + key);
    }
    if (key.slice(2) in out) throw Error('参数重复：' + key);
    out[key.slice(2)] = argv[++i];
  }
  return out;
}

async function json(value) {
  if (!value) throw Error('缺少 JSON 参数');
  return JSON.parse(
    value.startsWith('@')
      ? await fs.readFile(value.slice(1), 'utf8')
      : value
  );
}

function required(args, ...names) {
  for (const name of names) {
    if (!args[name]) throw Error('缺少 --' + name);
  }
}

async function exclusive(file, content) {
  if (!file) throw Error('缺少 --output');
  await fs.writeFile(file, content, { flag: 'wx' });
}

export async function main(argv = process.argv.slice(2), client = createNodeClient()) {
  if (!argv.length || argv[0] === 'help' || argv[0] === '--help') {
    console.log(usage);
    return;
  }

  const command = argv[0];
  const args = flags(argv.slice(1));
  let result;

  const id = () => {
    required(args, 'id');
    return args.id;
  };

  const mutation = () => {
    required(args, 'revision', 'request-id');
    const expectedRevision = Number(args.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw Error('revision 必须为正整数');
    }
    return {
      id: id(),
      expectedRevision,
      clientRequestId: args['request-id']
    };
  };

  if (command === 'start') {
    required(args, 'request-id');
    let input = args.input ? await json(args.input) : {};

    if (args.topic) {
      input.topic = args.topic;
    }

    if (args.scope) {
      input.scope = args.scope;
    }

    if (args['max-sources']) {
      input.maxSources = Number(args['max-sources']);
    }

    if (args.languages) {
      input.languages = args.languages.split(',');
    }

    if (args['auto-approve']) {
      input.autoApprove = args['auto-approve'] === 'true';
    }

    if (!input.topic) {
      throw Error('缺少研究主题。使用 --topic 或 --input');
    }

    result = await client.invoke('workflow.start', {
      engineId: ENGINE_ID,
      input,
      clientRequestId: args['request-id']
    });

  } else if (command === 'list') {
    result = await client.invoke('workflow.list', {
      engineId: ENGINE_ID
    });

  } else if (command === 'get') {
    result = await client.invoke('workflow.get', {
      id: id()
    });

  } else if (command === 'respond') {
    required(args, 'action');
    const answer = { action: args.action };

    // Parse additional response data
    if (args.data) {
      Object.assign(answer, await json(args.data));
    }

    result = await client.invoke('workflow.respond', {
      ...mutation(),
      answer
    });

  } else if (command === 'resume') {
    result = await client.invoke('workflow.resume', mutation());

  } else if (command === 'cancel') {
    result = await client.invoke('workflow.cancel', {
      id: id()
    });

  } else if (command === 'download') {
    required(args, 'output');
    const job = await client.invoke('workflow.get', { id: id() });

    if (job.engineId !== ENGINE_ID || job.status !== 'completed') {
      throw Error('研究尚未完成');
    }

    if (!job.files || job.files.length === 0) {
      throw Error('没有可下载的报告');
    }

    // Download first file (main report)
    const fileInfo = job.files[0];
    const file = await client.invoke('workflow.file', {
      id: job.id,
      name: fileInfo.name
    });

    let content;
    if (file.encoding === 'base64') {
      content = Buffer.from(file.content, 'base64');
    } else {
      content = Buffer.from(file.content, 'utf8');
    }

    if (content.length !== file.bytes) {
      throw Error('文件大小不匹配');
    }

    await exclusive(args.output, content);
    result = {
      output: path.resolve(args.output),
      bytes: content.length,
      sha256: file.sha256
    };

  } else {
    throw Error('未知命令：' + command + '。运行 --help 查看用法。');
  }

  console.log(JSON.stringify({ ok: true, data: result }, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      code: error.code ?? 'RESEARCH_ERROR'
    }));
    process.exitCode = 1;
  });
}
