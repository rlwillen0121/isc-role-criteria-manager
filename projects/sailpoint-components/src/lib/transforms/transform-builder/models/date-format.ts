import { BranchedStep, Step, Uid } from 'sequential-workflow-designer';
import {
  createChoiceValueModel,
  createStepModel,
  createStringValueModel
} from 'sequential-workflow-editor-model';
import { deserializeToStep, serializeStep } from '../transform-builder.component';

let description = 'Use the date format transform to convert datetime strings from one format to another. This is often useful when you are syncing data from one system to another, where each application uses a different format for date and time data.'

export function createDateFormat(): DateFormatStep {
  return {
    id: Uid.next(),
    componentType: 'switch',
    name: 'Date Format',
    type: 'dateFormat',
    description: description,
    properties: {
      inputFormat: 'ISO8601',
      outputFormat: 'MM/dd/yyyy',
      customInputFormat: '', // Add this for custom input format
      customOutputFormat: '', // Add this for custom output format
    },
    branches: {
      input: [],
    },
  };
}

export interface DateFormatStep extends BranchedStep {
  type: 'dateFormat';
  componentType: 'switch';
  description?: string;
  properties: {
    inputFormat: string;
    outputFormat: string;
    customInputFormat?: string; // Optional custom input format
    customOutputFormat?: string; // Optional custom output format
  };
}

export const DateFormatModel = createStepModel<DateFormatStep>(
    'dateFormat',
    'switch',
    (step) => {
      step
        .property('inputFormat')
        .value(
          createChoiceValueModel({
            choices: [
              'ISO8601',
              'LDAP',
              'PEOPLE_SOFT',
              'EPOCH_TIME_JAVA',
              'EPOCH_TIME_WIN32',
              'CUSTOM'
            ],
            defaultValue: 'ISO8601',
          })
        )
        .hint(
          'This string value indicates either the explicit SimpleDateFormat or the built-in named format of the incoming data.'
        )
        .label('Input Format');
    
    step
        .property('outputFormat')
        .value(
            createChoiceValueModel({
            choices: [
              'ISO8601',
              'LDAP',
              'PEOPLE_SOFT',
              'EPOCH_TIME_JAVA',
              'EPOCH_TIME_WIN32',
              'CUSTOM'
            ],
            defaultValue: 'ISO8601',
          })
        )
        .hint(
          'This string value indicates either the explicit SimpleDateFormat or the built-in named format that the data is formatted into.'
        )
        .label('Output Format');

    // Add custom format properties
    step
        .property('customInputFormat')
        .value(
            createStringValueModel({
                minLength: 0,
              })
        )
        .hint(
          'Custom SimpleDateFormat pattern for input (e.g., yyyy-MM-dd HH:mm:ss)'
        )
        .label('Custom Input Format');

    step
        .property('customOutputFormat')
        .value(
            createStringValueModel({
                minLength: 0,
              })
        )
        .hint(
          'Custom SimpleDateFormat pattern for output (e.g., dd/MM/yyyy)'
        )
        .label('Custom Output Format');
    }
  );

export function serializeDateFormat(step: DateFormatStep) {
  const attributes: Record<string, any> = {
    // Use custom format if CUSTOM is selected, otherwise use the selected format
    inputFormat: step.properties.inputFormat === 'CUSTOM' 
      ? step.properties.customInputFormat 
      : step.properties.inputFormat,
    outputFormat: step.properties.outputFormat === 'CUSTOM' 
      ? step.properties.customOutputFormat 
      : step.properties.outputFormat,
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

export function deserializeDateFormat(data: any): DateFormatStep {  
  const step: DateFormatStep = {
    id: Uid.next(),
    componentType: 'switch',
    name: data.name ?? 'Date Format',
    type: 'dateFormat',
    description: description,
    properties: {
      inputFormat: 'ISO8601',
      outputFormat: 'MM/dd/yyyy',
      customInputFormat: '',
      customOutputFormat: '',
    },
    branches: {
      input: [],
    },
  };

  // Determine if the incoming format is a known format or custom
  const knownFormats = ['ISO8601', 'LDAP', 'PEOPLE_SOFT', 'EPOCH_TIME_JAVA', 'EPOCH_TIME_WIN32'];
  
  if (data.attributes.inputFormat) {
    if (data.attributes.inputFormat && knownFormats.includes(data.attributes.inputFormat as string)) {
      step.properties.inputFormat = data.attributes.inputFormat as string;
    } else {
      step.properties.inputFormat = 'CUSTOM';
      step.properties.customInputFormat = data.attributes.inputFormat ? String(data.attributes.inputFormat) : '';
    }
  }

  if (data.attributes.outputFormat) {
    if (data.attributes.outputFormat && knownFormats.includes(data.attributes.outputFormat as string)) {
      step.properties.outputFormat = data.attributes.outputFormat as string;
    } else {
      step.properties.outputFormat = 'CUSTOM';
      step.properties.customOutputFormat = data.attributes.outputFormat ? String(data.attributes.outputFormat) : '';
    }
  }

  if (data.attributes.input) {
    step.branches.input.push(deserializeToStep(data.attributes.input));
  }

  return step;
}

export function isDateFormatStep(step: Step): step is DateFormatStep {
  return step.type === 'dateFormat';
}

export function getDateFormatIcon(): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
  <path d="M0 0h24v24H0z" fill="none"/>
  <path fill="gray" d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
  </svg>`;
const encoded = encodeURIComponent(svg.trim());
return `data:image/svg+xml,${encoded}`;
}

export const DateFormatMap: Record<string, string> = {
  "ISO8601": "ISO8601",
  "LDAP": "LDAP",
  "PEOPLE_SOFT": "PeopleSoft", 
  "EPOCH_TIME_JAVA": "Epoch Time (Java)",
  "EPOCH_TIME_WIN32": "Epoch Time (Win32)",
  "CUSTOM": "Custom SimpleDateFormat",
}

// Helper function to validate SimpleDateFormat patterns
export function validateDateFormatPattern(pattern: string): { isValid: boolean; error?: string } {
  if (!pattern || pattern.trim() === '') {
    return { isValid: false, error: 'Pattern cannot be empty' };
  }

  // Basic validation for common SimpleDateFormat patterns
  const validPatterns = /^[yMdHhmsaEGwWDFkKzZSX\s\-/.,:'"]*$/;
  if (!validPatterns.test(pattern)) {
    return { isValid: false, error: 'Invalid characters in date pattern' };
  }

  return { isValid: true };
}

// Helper function to get example output for a given pattern
export function getDateFormatExample(pattern: string): string {
  const examples: Record<string, string> = {
    'yyyy-MM-dd': '2024-03-15',
    'MM/dd/yyyy': '03/15/2024',
    'dd/MM/yyyy': '15/03/2024',
    'yyyy-MM-dd HH:mm:ss': '2024-03-15 14:30:45',
    'MMM dd, yyyy': 'Mar 15, 2024',
    'EEEE, MMMM dd, yyyy': 'Friday, March 15, 2024',
    'HH:mm:ss': '14:30:45',
    'yyyy-DDD': '2024-075',
  };

  return examples[pattern] || 'Example: 2024-03-15';
}