import { Uid } from "sequential-workflow-designer";
import { BranchedStep, Properties, Step } from "sequential-workflow-model";
import { deserializeToStep, serializeStep } from "../transform-builder.component";

let description = 'Use the decompose diacritical marks transform to clean or standardize symbols used within language to inform the reader how to say or pronounce a letter. These symbols are often incompatible with downstream applications and must be standardized to another character set such as ASCII.'

export function createDecomposeDiacriticalMarks(): DecomposeDiacriticalMarksStep {
    return {
      id: Uid.next(),
      componentType: 'switch',
      name: 'Decompose Diacritical Marks',
      type: 'decomposeDiacriticalMarks',
      description: description,
      properties: {},
      branches: {
        input: [],
      },
    };
  }

export interface DecomposeDiacriticalMarksStep extends BranchedStep {
    type: 'decomposeDiacriticalMarks';
    componentType: 'switch';
    description?: string;
    properties: Properties;
}



  export function serializeDecomposeDiacriticalMarks(step: DecomposeDiacriticalMarksStep) {
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

  export function deserializeDecomposeDiacriticalMarks(data: any): DecomposeDiacriticalMarksStep {
    const step: DecomposeDiacriticalMarksStep = {
      id: Uid.next(),
      componentType: 'switch',
      name: data.name ?? 'Decompose Diacritical Marks',
      type: 'decomposeDiacriticalMarks',
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

  export function isDecomposeDiacriticalMarksStep(step: Step): step is DecomposeDiacriticalMarksStep {
    return step.type === 'decomposeDiacriticalMarks';
  }