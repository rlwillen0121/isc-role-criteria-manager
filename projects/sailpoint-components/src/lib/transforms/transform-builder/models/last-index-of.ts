import { BranchedStep, Step, Uid } from 'sequential-workflow-designer';
import {
  createStepModel,
  createStringValueModel
} from 'sequential-workflow-editor-model';
import { deserializeToStep, serializeStep } from '../transform-builder.component';

let description = 'Use the last index of transform to get the last location of a specific substring within an incoming value. This transform is often useful in conjunction with the substring transform for getting parts of strings that can be dynamic in length or composition. If the substring you are searching for does not occur within the data, the transform returns -1.'

export function createLastIndexOf(): LastIndexOfStep {
  return {
    id: Uid.next(),
    componentType: 'switch',
    name: 'Last Index Of',
    type: 'lastIndexOf',
    description: description,
    properties: {
        substring: '',
    },
    branches: {
      input: [],
    },
  };
}

export interface LastIndexOfStep extends BranchedStep {
  type: 'lastIndexOf';
  componentType: 'switch';
  description?: string;
  properties: {
    substring: string;
  };
}

export const LastIndexOfModel = createStepModel<LastIndexOfStep>(
    'lastIndexOf',
    'switch',
    (step) => {
      step
        .property('substring')
        .value(
            createStringValueModel({
                minLength: 1,
              })
        )
        .hint(
          'This string value indicates the substring to find the last index of.'
        )
        .label('Search Substring');
    }
  );

export function serializeLastIndexOf(step: LastIndexOfStep) {
  const attributes: Record<string, any> = {
    substring: step.properties.substring,
  };

  if (step.branches.input.length > 0) {
    attributes.input = serializeStep(step.branches.input[0]);
  }

  return {
    name: step.name,
    type: step.type,
    attributes: attributes,
  };
}

export function deserializeLastIndexOf(data: any): LastIndexOfStep {
  const step: LastIndexOfStep = {
    id: Uid.next(),
    componentType: 'switch',
    name: data.name ?? 'Last Index Of',
    type: 'lastIndexOf',
    description: description,
    properties: {
        substring: data.attributes.substring,
    },
    branches: {
      input: [],
    },
  };

  if (data.attributes.input) {
    step.branches.input.push(deserializeToStep(data.attributes.input));
  }

  return step;
}


export function isLastIndexOfStep(step: Step): step is LastIndexOfStep {
  return step.type === 'lastIndexOf';
}