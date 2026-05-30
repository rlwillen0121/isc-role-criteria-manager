import {
  Step,
  Uid
} from 'sequential-workflow-designer';
import { createBooleanValueModel, createNumberValueModel, createStepModel } from 'sequential-workflow-editor-model';

let description = 'This transform allows you to generate a random string up to 450 characters, using true/false flags to denote whether the string includes numbers and/or special characters.'

export function createGenerateRandomString(): GenerateRandomStringStep  {
    return {
      id: Uid.next(),
      componentType: 'task',
      name: 'Generate Random String',
      type: 'generateRandomString',
      description: description,
      properties: {
        includeNumbers: true,
        includeSpecialChars: true,
        length: 16,
      }
    };
  }

  export interface GenerateRandomStringStep extends Step {
    type: 'generateRandomString';
    componentType: 'task';
    description?: string;
    properties: {
        includeNumbers: boolean;
        includeSpecialChars: boolean;
        length: number;
    };
  }

  export const GenerateRandomStringModel = createStepModel<GenerateRandomStringStep>(
    'generateRandomString',
    'task',
    (step) => {

      step.property('length').value(createNumberValueModel({
        min: 1,
        max: 450
      })).label('String Length')
      .hint('The length of the random string to generate. Must be between 1 and 450 characters.');

      step
      .property('includeNumbers')
      .value(
        createBooleanValueModel({
          defaultValue: true,
        })
      )
      .hint("This configuration's value is a boolean (true/false). It controls whether to include numbers in the generated string.")
      .label('Include Numbers');

      step
      .property('includeSpecialChars')
      .value(
        createBooleanValueModel({
          defaultValue: true,
        })
      )
      .hint("This configuration's value is a boolean (true/false). It controls whether to include special characters in the generated string.")
      .label('Include Special Characters');
    }
  );

  export function serializeGenerateRandomString(step: GenerateRandomStringStep) {

    return {
      name: step.name,
      type: "rule",
      attributes: {
        name: "Cloud Services Deployment Utility",
        operation: "generateRandomString",
        includeNumbers: step.properties.includeNumbers,
        includeSpecialChars: step.properties.includeSpecialChars,
        length: step.properties.length,
      }
    };
  }
  
  export function deserializeGenerateRandomString(data: any): GenerateRandomStringStep {  
      return {
        id: Uid.next(),
        componentType: 'task',
        type: 'generateRandomString',
        name: data.name ?? 'Generate Random String',
        description: description,
        properties: {
          includeNumbers: data.attributes.includeNumbers,
          includeSpecialChars: data.attributes.includeSpecialChars,
          length: data.attributes.length,
        }
      };
    }
  
  export function isGenerateRandomStringStep(
    step: Step
  ): step is GenerateRandomStringStep {
    return step.type === 'generateRandomString';
  }