import { BranchedStep, Properties, Step, Uid } from 'sequential-workflow-designer';
import { deserializeToStep, serializeStep } from '../transform-builder.component';

let description = 'The base64 decode transform allows you to take incoming data that has been encoded using a Base64-based text encoding scheme and render the data in its original binary format.';

export function createBase64Decode(): Base64DecodeStep {
  return {
    id: Uid.next(),
    componentType: 'switch',
    name: 'Base64 Decode',
    type: 'base64Decode',
    description: description,
    properties: {},
    branches: {
      input: [],
    },
  };
}

export interface Base64DecodeStep extends BranchedStep {
  type: 'base64Decode';
  componentType: 'switch';
  description?: string;
  properties: Properties;
}

export function serializeBase64Decode(step: Base64DecodeStep) {
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

export function deserializeBase64Decode(data: any): Base64DecodeStep {
  const step: Base64DecodeStep = {
    id: Uid.next(),
    componentType: 'switch',
    name: data.name ?? 'Base64 Decode',
    type: 'base64Decode',
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


export function isBase64DecodeStep(step: Step): step is Base64DecodeStep {
  return step.type === 'base64Decode';
}


export function getBase64DecodeIcon(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
    <path d="M0 0h24v24H0z" fill="none"/><path fill="grey" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/></svg>`;
    const encoded = encodeURIComponent(svg.trim());
    return `data:image/svg+xml,${encoded}`;
  }

