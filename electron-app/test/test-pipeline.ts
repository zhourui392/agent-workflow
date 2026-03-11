/**
 * 流水线执行功能测试
 *
 * 模拟完整工作流执行流程，不调用实际Claude API
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WorkflowStep {
  name: string;
  prompt: string;
  model?: string;
  onFailure?: 'stop' | 'skip' | 'retry';
}

interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
  onFailure: 'stop' | 'skip' | 'retry';
}

interface StepResult {
  success: boolean;
  outputText: string;
  tokensUsed: number;
  errorMessage?: string;
}

interface TemplateContext {
  inputs?: Record<string, unknown>;
  steps?: Record<string, { output: string }>;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNestedValue(obj: Record<string, unknown>, pathStr: string): unknown {
  const parts = pathStr.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function renderTemplate(template: string, context: TemplateContext): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const builtins: Record<string, string> = {
    today: formatDate(now),
    yesterday: formatDate(yesterday)
  };

  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, varName: string) => {
    const name = varName.trim();
    if (name in builtins) return builtins[name];
    const value = getNestedValue(context as Record<string, unknown>, name);
    if (value === undefined || value === null) return match;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

async function mockExecuteStep(prompt: string): Promise<StepResult> {
  await new Promise(resolve => setTimeout(resolve, 10));

  if (prompt.includes('FAIL')) {
    return {
      success: false,
      outputText: '',
      tokensUsed: 0,
      errorMessage: 'Simulated failure'
    };
  }

  return {
    success: true,
    outputText: `Mock output for: ${prompt.substring(0, 50)}...`,
    tokensUsed: Math.floor(Math.random() * 100) + 50
  };
}

async function executePipeline(
  workflow: Workflow,
  inputs: Record<string, unknown>
): Promise<{ success: boolean; totalTokens: number; stepResults: StepResult[] }> {
  const context: TemplateContext = {
    inputs,
    steps: {}
  };

  let totalTokens = 0;
  const stepResults: StepResult[] = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    console.log(`  Executing step ${i + 1}/${workflow.steps.length}: ${step.name}`);

    const renderedPrompt = renderTemplate(step.prompt, context);
    console.log(`    Rendered prompt: ${renderedPrompt.substring(0, 60)}...`);

    const result = await mockExecuteStep(renderedPrompt);
    stepResults.push(result);

    if (result.success) {
      context.steps![step.name] = { output: result.outputText };
      totalTokens += result.tokensUsed;
      console.log(`    ✓ Success (${result.tokensUsed} tokens)`);
    } else {
      console.log(`    ✗ Failed: ${result.errorMessage}`);

      const onFailure = step.onFailure || workflow.onFailure;
      if (onFailure === 'stop') {
        console.log(`    Pipeline stopped due to failure`);
        return { success: false, totalTokens, stepResults };
      } else if (onFailure === 'skip') {
        console.log(`    Skipping to next step`);
        continue;
      }
    }
  }

  return { success: true, totalTokens, stepResults };
}

async function testSuccessfulPipeline() {
  const workflow: Workflow = {
    id: 'test-1',
    name: 'Success Pipeline',
    enabled: true,
    steps: [
      { name: 'analyze', prompt: 'Analyze the input: {{inputs.data}}' },
      { name: 'process', prompt: 'Process based on: {{steps.analyze.output}}' },
      { name: 'summarize', prompt: 'Summarize: {{steps.process.output}}' }
    ],
    onFailure: 'stop'
  };

  const inputs = { data: 'test data' };
  const result = await executePipeline(workflow, inputs);

  if (!result.success) throw new Error('Pipeline should succeed');
  if (result.stepResults.length !== 3) throw new Error('Should have 3 step results');
  if (result.totalTokens <= 0) throw new Error('Should have used tokens');

  console.log(`  Total tokens: ${result.totalTokens}`);
  console.log('✓ Successful pipeline test passed');
}

async function testFailureStopPipeline() {
  const workflow: Workflow = {
    id: 'test-2',
    name: 'Failure Stop Pipeline',
    enabled: true,
    steps: [
      { name: 'step1', prompt: 'Step 1' },
      { name: 'step2', prompt: 'FAIL this step' },
      { name: 'step3', prompt: 'Step 3' }
    ],
    onFailure: 'stop'
  };

  const result = await executePipeline(workflow, {});

  if (result.success) throw new Error('Pipeline should fail');
  if (result.stepResults.length !== 2) throw new Error('Should stop at step 2');

  console.log('✓ Failure stop pipeline test passed');
}

async function testFailureSkipPipeline() {
  const workflow: Workflow = {
    id: 'test-3',
    name: 'Failure Skip Pipeline',
    enabled: true,
    steps: [
      { name: 'step1', prompt: 'Step 1' },
      { name: 'step2', prompt: 'FAIL this step', onFailure: 'skip' },
      { name: 'step3', prompt: 'Step 3' }
    ],
    onFailure: 'stop'
  };

  const result = await executePipeline(workflow, {});

  if (!result.success) throw new Error('Pipeline should succeed (skip failed step)');
  if (result.stepResults.length !== 3) throw new Error('Should have 3 step results');

  const failedStep = result.stepResults[1];
  if (failedStep.success) throw new Error('Step 2 should have failed');

  console.log('✓ Failure skip pipeline test passed');
}

async function testTemplateVariables() {
  const workflow: Workflow = {
    id: 'test-4',
    name: 'Template Test Pipeline',
    enabled: true,
    steps: [
      {
        name: 'date_test',
        prompt: 'Today is {{today}}, yesterday was {{yesterday}}'
      },
      {
        name: 'input_test',
        prompt: 'User name is {{inputs.user.name}}'
      },
      {
        name: 'step_ref_test',
        prompt: 'Previous output: {{steps.date_test.output}}'
      }
    ],
    onFailure: 'stop'
  };

  const inputs = { user: { name: 'TestUser' } };
  const result = await executePipeline(workflow, inputs);

  if (!result.success) throw new Error('Pipeline should succeed');
  console.log('✓ Template variables test passed');
}

async function testEmptyWorkflow() {
  const workflow: Workflow = {
    id: 'test-5',
    name: 'Empty Pipeline',
    enabled: true,
    steps: [],
    onFailure: 'stop'
  };

  const result = await executePipeline(workflow, {});

  if (!result.success) throw new Error('Empty pipeline should succeed');
  if (result.stepResults.length !== 0) throw new Error('Should have 0 step results');
  if (result.totalTokens !== 0) throw new Error('Should use 0 tokens');

  console.log('✓ Empty workflow test passed');
}

async function main() {
  console.log('=== Pipeline Execution Tests ===\n');

  try {
    console.log('--- Successful Pipeline ---');
    await testSuccessfulPipeline();
    console.log('');

    console.log('--- Failure Stop Pipeline ---');
    await testFailureStopPipeline();
    console.log('');

    console.log('--- Failure Skip Pipeline ---');
    await testFailureSkipPipeline();
    console.log('');

    console.log('--- Template Variables ---');
    await testTemplateVariables();
    console.log('');

    console.log('--- Empty Workflow ---');
    await testEmptyWorkflow();
    console.log('');

    console.log('=== All Pipeline Tests Passed! ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
