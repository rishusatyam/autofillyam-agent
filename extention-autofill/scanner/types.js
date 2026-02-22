// ========================================
// Scanner — shared JSDoc type definitions
// ========================================
// No runtime code — imported solely for editor intellisense.

/**
 * @typedef {'text'|'dropdown'|'radio'|'checkbox'|'toggle'} FieldType
 */

/**
 * @typedef {Object} RawField
 * Raw field produced by a detector before any processing.
 * @property {FieldType}   type
 * @property {string|null} label
 * @property {string|null} placeholder
 * @property {string|null} section
 * @property {string[]}    options       - may be empty at detect time
 * @property {Element}     _element      - primary DOM element
 * @property {Element}     [_control]    - clickable control (custom dropdowns)
 * @property {string}      [_groupName]  - used by radio grouper
 */

/**
 * @typedef {Object} ProcessedField
 * Final field after the full pipeline.
 * @property {string}      fieldId
 * @property {FieldType}   type
 * @property {string}      label
 * @property {string}      placeholder
 * @property {string}      section
 * @property {string[]}    options
 */

/**
 * @typedef {Object} ScanResult
 * @property {string}         provider
 * @property {ProcessedField[]} fields
 * @property {ScanMetadata}   metadata
 */

/**
 * @typedef {Object} ScanMetadata
 * @property {number} totalFields
 * @property {number} scanDuration    - milliseconds
 * @property {Record<string,number>} typeSummary
 */

/**
 * @typedef {Object} RegistryEntry
 * @property {FieldType}  type
 * @property {Element}    element
 * @property {Element[]}  [elements]  - radio buttons
 * @property {string[]}   options
 */

/**
 * @typedef {Record<string, RegistryEntry>} FieldRegistry
 */
