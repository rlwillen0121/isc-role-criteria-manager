import { Uid } from "sequential-workflow-designer";
import { BranchedStep, Properties, Step } from "sequential-workflow-model";
import { deserializeToStep, serializeStep } from "../transform-builder.component";

let description = 'Use the name normalizer transform to clean or standardize the spelling of strings coming in from source systems. The most common use for this transform is for names and other proper nouns, but the transform is not necessarily limited to those data elements.'

export function createNameNormalizer(): NameNormalizerStep {
    return {
      id: Uid.next(),
      componentType: 'switch',
      name: 'Name Normalizer',
      type: 'NameNormalizer',
      description: description,
      properties: {},
      branches: {
        input: [],
      },
    };
  }

export interface NameNormalizerStep extends BranchedStep {
    type: 'NameNormalizer';
    componentType: 'switch';
    description?: string;
    properties: Properties;
}



  export function serializeNameNormalizer(step: NameNormalizerStep) {
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

  export function deserializeNameNormalizer(data: any): NameNormalizerStep {
    const step: NameNormalizerStep = {
      id: Uid.next(),
      componentType: 'switch',
      name: data.name ?? 'Name Normalizer',
      type: 'NameNormalizer',
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

  export function isNameNormalizerStep(step: Step): step is NameNormalizerStep {
    return step.type === 'NameNormalizer';
  }