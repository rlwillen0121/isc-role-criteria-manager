import { BranchedStep, Properties, Step, Uid } from 'sequential-workflow-designer';
import { deserializeToStep, serializeStep } from '../transform-builder.component';

let description = 'The base64 encode transform allows you to take incoming data and encode it using a Base64-based text encoding scheme. The output of the transform is a string comprising 64 basic ASCII characters.';

export function createBase64Encode(): Base64EncodeStep {
  return {
    id: Uid.next(),
    componentType: 'switch',
    name: 'Base64 Encode',
    type: 'base64Encode',
    description: description,
    properties: {},
    branches: {
      input: [],
    },
  };
}

export interface Base64EncodeStep extends BranchedStep {
  type: 'base64Encode';
  componentType: 'switch';
  description?: string;
  properties: Properties;
}

export function serializeBase64Encode(step: Base64EncodeStep) {
  const attributes: Record<string, any> = {};

  if (step.branches.input.length > 0) {
    attributes.input = serializeStep(step.branches.input[0]);
  }

  return {
    name: step.name,
    type: step.type,
    attributes: attributes,
  };
}

export function deserializeBase64Encode(data: any): Base64EncodeStep {
  const step: Base64EncodeStep = {
    id: Uid.next(),
    componentType: 'switch',
    name: data.name ?? 'Base64 Encode',
    type: 'base64Encode',
    description: description,
    properties: {},
    branches: {
      input: [],
    },
  };

  if (data.attributes.input) {
    step.branches.input.push(deserializeToStep(data.attributes.input));
  }

  return step;
}


export function isBase64EncodeStep(step: Step): step is Base64EncodeStep {
  return step.type === 'base64Encode';
}


export function getBase64EncodeIcon(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
    <path d="M0 0h24v24H0z" fill="none"/><path fill="grey" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`;
    const encoded = encodeURIComponent(svg.trim());
    return `data:image/svg+xml,${encoded}`;
  }

