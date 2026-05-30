import {
  Step,
  Uid
} from 'sequential-workflow-designer';
import { createStepModel, createStringValueModel } from 'sequential-workflow-editor-model';

let description = 'This transform allows you to get the identity attribute of another user from within a given identity\'s calculation. For your convenience, the transform allows you to use "manager" as a referential lookup to the target identity.'

export function createGetReferenceIdentityAttribute(): GetReferenceIdentityAttributeStep  {
    return {
      id: Uid.next(),
      componentType: 'task',
      name: 'Get Reference Identity Attribute',
      type: 'getReferenceIdentityAttribute',
      description: description,
      properties: {
        uid: '',
        attributeName: '',
      }
    };
  }

  export interface GetReferenceIdentityAttributeStep extends Step {
    type: 'getReferenceIdentityAttribute';
    componentType: 'task';
    description?: string;
    properties: {
        uid: string;
        attributeName: string;
    };
  }

  export const GetReferenceIdentityAttributeModel = createStepModel<GetReferenceIdentityAttributeStep>(
    'getReferenceIdentityAttribute',
    'task',
    (step) => {

      step
        .property('uid')
        .value(
          createStringValueModel({
            minLength: 1,
          })
        )
        .hint('This is the SailPoint User Name (uid) value of the identity whose attribute is desired. For your convenience, you can use the "manager" keyword to look up the user\'s manager and then get that manager\'s identity attribute.')
        .label('SailPoint User Name (uid)');

      step
        .property('attributeName')
        .value(
          createStringValueModel({
            minLength: 1,
          })
        )
        .hint('This is the name of the identity attribute to retrieve from the target identity. For example, you might use this to get the "department" attribute of a user\'s manager.')
        .label('Attribute Name');
    }
  );
  


  export function serializeGetReferenceIdentityAttribute(step: GetReferenceIdentityAttributeStep) {
    return {
      name: step.name,
      type: "rule",
      attributes: {
        name: "Cloud Services Deployment Utility",
        operation: "getReferenceIdentityAttribute",
        uid: step.properties.uid,
        attributeName: step.properties.attributeName,
      }
    };
  }
  
  export function deserializeGetReferenceIdentityAttribute(data: any): GetReferenceIdentityAttributeStep {  
      return {
        id: Uid.next(),
        componentType: 'task',
        type: 'getReferenceIdentityAttribute',
        name: data.name ?? 'Get Reference Identity Attribute',
        description: description,
        properties: {
            uid: data.attributes.uid,
            attributeName: data.attributes.attributeName,
        }
      };
    }
  
  export function isGetReferenceIdentityAttributeStep(
    step: Step
  ): step is GetReferenceIdentityAttributeStep {
    return step.type === 'getReferenceIdentityAttribute';
  }