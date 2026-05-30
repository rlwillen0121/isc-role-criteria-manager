import {
  BranchedStep,
  Step,
  Uid
} from 'sequential-workflow-designer';
import { createNumberValueModel, createStepModel } from 'sequential-workflow-editor-model';
import { serializeStep } from '../transform-builder.component';

let description = 'This transform allows you to get the rightmost N characters of a string.'

export function createGetEndOfString(): GetEndOfStringStep  {
    return {
      id: Uid.next(),
      componentType: 'switch',
      name: 'Get End of String',
      type: 'getEndOfString',
      description: description,
      properties: {
        numChars: 4,
      },
      branches: {
        input: [],
      },
    };
  }

  export interface GetEndOfStringStep extends BranchedStep {
    type: 'getEndOfString';
    componentType: 'switch';
    description?: string;
    properties: {
        numChars: number;
    };
  }

  export const GetEndOfStringModel = createStepModel<GetEndOfStringStep>(
    'getEndOfString',
    'switch',
    (step) => {
      step.property('numChars')
        .value(createNumberValueModel({
          min: 1,
          max: 1000
        })  
      ).label('Number of Characters')
      .hint('This specifies how many of the rightmost characters within the incoming string the transform returns. If the value of numChars is greater than the string length, the transform returns null.');
    }
  );


  export function serializeGetEndOfString(step: GetEndOfStringStep) {

      const attributes: Record<string, any> = {
        name: "Cloud Services Deployment Utility",
        operation: "getEndOfString",
        numChars: step.properties.numChars,
      };
    
      if (step.branches.input.length > 0) {
        attributes.input = serializeStep(step.branches.input[0]);
      }
    
      return {
        name: step.name,
        type: "rule",
        attributes: attributes,
      };
  }
  
  export function deserializeGetEndOfString(data: any): GetEndOfStringStep {  
      return {
        id: Uid.next(),
        componentType: 'switch',
        type: 'getEndOfString',
        name: data.name ?? 'Get End of String',
        description: description,
        properties: {
            numChars: data.attributes.numChars,
        },
        branches: {
          input: [],
        },
      };
    }
  
  export function isGetEndOfStringStep(
    step: Step
  ): step is GetEndOfStringStep {
    return step.type === 'getEndOfString';
  }