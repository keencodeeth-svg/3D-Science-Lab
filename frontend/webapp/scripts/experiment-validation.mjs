const EDUCATION_STAGES = new Set(['小学', '初中', '高中']);
const SUBJECTS = new Set(['科学', '物理', '化学', '生物']);
const MODES = new Set(['引导', '练习', '考核']);
const PRODUCT_STATUSES = new Set(['规划中', '开发中', '试点可用', '产品级']);
const INTERACTION_MODES = new Set(['观察型', '半交互', '全交互']);
const ACTION_TYPES = new Set([
  'identify-object',
  'place-object',
  'connect-wire',
  'add-material',
  'heat-object',
  'adjust-focus',
  'switch-view',
  'record-observation',
  'set-variable',
  'complete-summary',
]);
const MULTISCALE_LENSES = new Set(['macro', 'meso', 'micro']);
const MATERIAL_STATES = new Set(['solid', 'liquid', 'gas', 'mixed']);
const MICRO_ARRANGEMENTS = new Set(['lattice', 'cluster', 'flow', 'solution', 'gas', 'chain', 'network']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushError(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function expectRecord(value, path, errors) {
  if (!isRecord(value)) {
    pushError(errors, path, 'must be an object');
    return false;
  }
  return true;
}

function expectAllowedKeys(record, path, requiredKeys, optionalKeys, errors) {
  if (!isRecord(record)) return;

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of requiredKeys) {
    if (!(key in record)) {
      pushError(errors, `${path}.${key}`, 'is required');
    }
  }

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, 'is not allowed');
    }
  }
}

function expectString(value, path, errors, options = {}) {
  const { minLength = 1 } = options;
  if (typeof value !== 'string') {
    pushError(errors, path, 'must be a string');
    return false;
  }
  if (value.trim().length < minLength) {
    pushError(errors, path, `must be at least ${minLength} character(s)`);
    return false;
  }
  return true;
}

function expectBoolean(value, path, errors) {
  if (typeof value !== 'boolean') {
    pushError(errors, path, 'must be a boolean');
    return false;
  }
  return true;
}

function expectInteger(value, path, errors, options = {}) {
  const { min, max } = options;
  if (!Number.isInteger(value)) {
    pushError(errors, path, 'must be an integer');
    return false;
  }
  if (typeof min === 'number' && value < min) {
    pushError(errors, path, `must be >= ${min}`);
    return false;
  }
  if (typeof max === 'number' && value > max) {
    pushError(errors, path, `must be <= ${max}`);
    return false;
  }
  return true;
}

function expectEnum(value, allowedValues, path, errors) {
  if (!allowedValues.has(value)) {
    pushError(errors, path, `must be one of: ${[...allowedValues].join(', ')}`);
    return false;
  }
  return true;
}

function expectArray(value, path, errors, options = {}) {
  const { minItems = 0 } = options;
  if (!Array.isArray(value)) {
    pushError(errors, path, 'must be an array');
    return false;
  }
  if (value.length < minItems) {
    pushError(errors, path, `must contain at least ${minItems} item(s)`);
    return false;
  }
  return true;
}

function expectUniqueStrings(values, path, errors) {
  if (!Array.isArray(values)) return;
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    if (seen.has(value)) {
      pushError(errors, path, `contains duplicate value "${value}"`);
      continue;
    }
    seen.add(value);
  }
}

function validateStringArray(values, path, errors, options = {}) {
  const { minItems = 0, unique = false, allowedValues } = options;
  if (!expectArray(values, path, errors, { minItems })) {
    return;
  }
  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    if (!expectString(value, itemPath, errors)) {
      return;
    }
    if (allowedValues) {
      expectEnum(value, allowedValues, itemPath, errors);
    }
  });
  if (unique) {
    expectUniqueStrings(values, path, errors);
  }
}

function validateScene(scene, path, errors) {
  if (!expectRecord(scene, path, errors)) return;
  expectAllowedKeys(scene, path, ['environment', 'cameraPreset', 'assets'], [], errors);
  expectString(scene.environment, `${path}.environment`, errors);
  expectString(scene.cameraPreset, `${path}.cameraPreset`, errors);
  validateStringArray(scene.assets, `${path}.assets`, errors, { minItems: 1 });
}

function validateCurriculum(curriculum, path, errors) {
  if (!expectRecord(curriculum, path, errors)) return;
  expectAllowedKeys(curriculum, path, ['theme', 'unit', 'knowledgePoints'], [], errors);
  expectString(curriculum.theme, `${path}.theme`, errors);
  expectString(curriculum.unit, `${path}.unit`, errors);
  validateStringArray(curriculum.knowledgePoints, `${path}.knowledgePoints`, errors, { minItems: 1 });
}

function validateProductization(productization, path, errors) {
  if (!expectRecord(productization, path, errors)) return;
  expectAllowedKeys(productization, path, ['status', 'interactionMode', 'assessmentReady', 'teacherReady', 'assetsReady'], [], errors);
  if (expectString(productization.status, `${path}.status`, errors)) {
    expectEnum(productization.status, PRODUCT_STATUSES, `${path}.status`, errors);
  }
  if (expectString(productization.interactionMode, `${path}.interactionMode`, errors)) {
    expectEnum(productization.interactionMode, INTERACTION_MODES, `${path}.interactionMode`, errors);
  }
  expectBoolean(productization.assessmentReady, `${path}.assessmentReady`, errors);
  expectBoolean(productization.teacherReady, `${path}.teacherReady`, errors);
  expectBoolean(productization.assetsReady, `${path}.assetsReady`, errors);
}

function validateEquipment(equipment, path, errors) {
  if (!expectArray(equipment, path, errors, { minItems: 1 })) return [];

  const equipmentIds = new Set();
  equipment.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!expectRecord(item, itemPath, errors)) return;
    expectAllowedKeys(item, itemPath, ['id', 'name', 'type'], ['optional'], errors);
    if (expectString(item.id, `${itemPath}.id`, errors)) {
      if (equipmentIds.has(item.id)) {
        pushError(errors, `${itemPath}.id`, `duplicate equipment id "${item.id}"`);
      } else {
        equipmentIds.add(item.id);
      }
    }
    expectString(item.name, `${itemPath}.name`, errors);
    expectString(item.type, `${itemPath}.type`, errors);
    if ('optional' in item) {
      expectBoolean(item.optional, `${itemPath}.optional`, errors);
    }
  });

  return [...equipmentIds];
}

function validateSteps(steps, path, errors, capabilities = []) {
  if (!expectArray(steps, path, errors, { minItems: 1 })) return;

  const stepIds = new Set();
  const orders = [];
  const capabilitySet = new Set(capabilities);

  steps.forEach((step, index) => {
    const stepPath = `${path}[${index}]`;
    if (!expectRecord(step, stepPath, errors)) return;
    expectAllowedKeys(
      step,
      stepPath,
      ['id', 'order', 'title', 'actionType', 'targetObject', 'successCondition', 'failureHints', 'scoringWeight'],
      ['description', 'requiredCapabilities'],
      errors,
    );

    if (expectString(step.id, `${stepPath}.id`, errors)) {
      if (stepIds.has(step.id)) {
        pushError(errors, `${stepPath}.id`, `duplicate step id "${step.id}"`);
      } else {
        stepIds.add(step.id);
      }
    }
    if (expectInteger(step.order, `${stepPath}.order`, errors, { min: 1 })) {
      orders.push(step.order);
    }
    expectString(step.title, `${stepPath}.title`, errors);
    if ('description' in step) {
      expectString(step.description, `${stepPath}.description`, errors);
    }
    if (expectString(step.actionType, `${stepPath}.actionType`, errors)) {
      expectEnum(step.actionType, ACTION_TYPES, `${stepPath}.actionType`, errors);
    }
    expectString(step.targetObject, `${stepPath}.targetObject`, errors);
    expectString(step.successCondition, `${stepPath}.successCondition`, errors);
    validateStringArray(step.failureHints, `${stepPath}.failureHints`, errors, { minItems: 1 });
    expectInteger(step.scoringWeight, `${stepPath}.scoringWeight`, errors, { min: 1, max: 100 });

    if ('requiredCapabilities' in step) {
      validateStringArray(step.requiredCapabilities, `${stepPath}.requiredCapabilities`, errors, { unique: true });
      if (Array.isArray(step.requiredCapabilities) && capabilitySet.size > 0) {
        step.requiredCapabilities.forEach((capability, capabilityIndex) => {
          if (typeof capability === 'string' && !capabilitySet.has(capability)) {
            pushError(errors, `${stepPath}.requiredCapabilities[${capabilityIndex}]`, `unknown capability "${capability}"`);
          }
        });
      }
    }
  });

  if (orders.length === steps.length) {
    const sortedOrders = [...orders].sort((left, right) => left - right);
    sortedOrders.forEach((order, index) => {
      if (order !== index + 1) {
        pushError(errors, path, 'step orders must be unique and contiguous starting from 1');
      }
    });
  }
}

function validateScoring(scoring, path, errors) {
  if (!expectRecord(scoring, path, errors)) return;
  expectAllowedKeys(scoring, path, ['stepScorePercent', 'observationScorePercent', 'resultScorePercent'], [], errors);

  const hasStep = expectInteger(scoring.stepScorePercent, `${path}.stepScorePercent`, errors, { min: 0, max: 100 });
  const hasObservation = expectInteger(scoring.observationScorePercent, `${path}.observationScorePercent`, errors, { min: 0, max: 100 });
  const hasResult = expectInteger(scoring.resultScorePercent, `${path}.resultScorePercent`, errors, { min: 0, max: 100 });

  if (hasStep && hasObservation && hasResult) {
    const total = scoring.stepScorePercent + scoring.observationScorePercent + scoring.resultScorePercent;
    if (total !== 100) {
      pushError(errors, path, `score percentages must sum to 100, received ${total}`);
    }
  }
}

function validateFeedback(feedback, path, errors) {
  if (!expectRecord(feedback, path, errors)) return;
  expectAllowedKeys(feedback, path, ['successSummary', 'commonMistakes'], [], errors);
  expectString(feedback.successSummary, `${path}.successSummary`, errors);
  validateStringArray(feedback.commonMistakes, `${path}.commonMistakes`, errors, { minItems: 1 });
}

function validateMultiscale(multiscale, path, errors, context) {
  if (!expectRecord(multiscale, path, errors)) return;
  expectAllowedKeys(multiscale, path, ['defaultLens', 'equipmentProfiles', 'materials', 'reactionRules'], [], errors);

  if (expectString(multiscale.defaultLens, `${path}.defaultLens`, errors)) {
    expectEnum(multiscale.defaultLens, MULTISCALE_LENSES, `${path}.defaultLens`, errors);
  }

  const materialIds = new Set();

  if (expectArray(multiscale.materials, `${path}.materials`, errors, { minItems: 1 })) {
    multiscale.materials.forEach((material, index) => {
      const materialPath = `${path}.materials[${index}]`;
      if (!expectRecord(material, materialPath, errors)) return;
      expectAllowedKeys(material, materialPath, ['id', 'name', 'category', 'state', 'properties'], ['formula', 'microModel'], errors);

      if (expectString(material.id, `${materialPath}.id`, errors)) {
        if (materialIds.has(material.id)) {
          pushError(errors, `${materialPath}.id`, `duplicate material id "${material.id}"`);
        } else {
          materialIds.add(material.id);
        }
      }
      expectString(material.name, `${materialPath}.name`, errors);
      expectString(material.category, `${materialPath}.category`, errors);
      if ('formula' in material) {
        expectString(material.formula, `${materialPath}.formula`, errors);
      }
      if (expectString(material.state, `${materialPath}.state`, errors)) {
        expectEnum(material.state, MATERIAL_STATES, `${materialPath}.state`, errors);
      }

      if (expectArray(material.properties, `${materialPath}.properties`, errors, { minItems: 1 })) {
        material.properties.forEach((property, propertyIndex) => {
          const propertyPath = `${materialPath}.properties[${propertyIndex}]`;
          if (!expectRecord(property, propertyPath, errors)) return;
          expectAllowedKeys(property, propertyPath, ['key', 'label', 'value'], ['unit'], errors);
          expectString(property.key, `${propertyPath}.key`, errors);
          expectString(property.label, `${propertyPath}.label`, errors);
          if (typeof property.value !== 'string' && typeof property.value !== 'number') {
            pushError(errors, `${propertyPath}.value`, 'must be a string or number');
          }
          if ('unit' in property) {
            expectString(property.unit, `${propertyPath}.unit`, errors);
          }
        });
      }

      if ('microModel' in material) {
        const microModel = material.microModel;
        const microPath = `${materialPath}.microModel`;
        if (!expectRecord(microModel, microPath, errors)) return;
        expectAllowedKeys(microModel, microPath, ['narrative', 'species', 'interactions'], [], errors);
        expectString(microModel.narrative, `${microPath}.narrative`, errors);
        validateStringArray(microModel.interactions, `${microPath}.interactions`, errors, { minItems: 1 });

        if (expectArray(microModel.species, `${microPath}.species`, errors, { minItems: 1 })) {
          const speciesIds = new Set();
          microModel.species.forEach((species, speciesIndex) => {
            const speciesPath = `${microPath}.species[${speciesIndex}]`;
            if (!expectRecord(species, speciesPath, errors)) return;
            expectAllowedKeys(species, speciesPath, ['id', 'name', 'color', 'particleCountHint', 'arrangement'], ['formula'], errors);
            if (expectString(species.id, `${speciesPath}.id`, errors)) {
              if (speciesIds.has(species.id)) {
                pushError(errors, `${speciesPath}.id`, `duplicate species id "${species.id}"`);
              } else {
                speciesIds.add(species.id);
              }
            }
            expectString(species.name, `${speciesPath}.name`, errors);
            if ('formula' in species) {
              expectString(species.formula, `${speciesPath}.formula`, errors);
            }
            expectString(species.color, `${speciesPath}.color`, errors);
            expectInteger(species.particleCountHint, `${speciesPath}.particleCountHint`, errors, { min: 1 });
            if (expectString(species.arrangement, `${speciesPath}.arrangement`, errors)) {
              expectEnum(species.arrangement, MICRO_ARRANGEMENTS, `${speciesPath}.arrangement`, errors);
            }
          });
        }
      }
    });
  }

  if (expectArray(multiscale.equipmentProfiles, `${path}.equipmentProfiles`, errors, { minItems: 1 })) {
    const equipmentIds = new Set(context.equipmentIds);
    multiscale.equipmentProfiles.forEach((profile, index) => {
      const profilePath = `${path}.equipmentProfiles[${index}]`;
      if (!expectRecord(profile, profilePath, errors)) return;
      expectAllowedKeys(profile, profilePath, ['equipmentId', 'physicalGroup', 'constraints', 'components'], [], errors);
      if (expectString(profile.equipmentId, `${profilePath}.equipmentId`, errors) && !equipmentIds.has(profile.equipmentId)) {
        pushError(errors, `${profilePath}.equipmentId`, `references unknown equipment "${profile.equipmentId}"`);
      }
      expectString(profile.physicalGroup, `${profilePath}.physicalGroup`, errors);
      validateStringArray(profile.constraints, `${profilePath}.constraints`, errors, { minItems: 1 });

      if (expectArray(profile.components, `${profilePath}.components`, errors, { minItems: 1 })) {
        const componentIds = new Set();
        profile.components.forEach((component, componentIndex) => {
          const componentPath = `${profilePath}.components[${componentIndex}]`;
          if (!expectRecord(component, componentPath, errors)) return;
          expectAllowedKeys(component, componentPath, ['id', 'name', 'role'], ['materialRef'], errors);
          if (expectString(component.id, `${componentPath}.id`, errors)) {
            if (componentIds.has(component.id)) {
              pushError(errors, `${componentPath}.id`, `duplicate component id "${component.id}"`);
            } else {
              componentIds.add(component.id);
            }
          }
          expectString(component.name, `${componentPath}.name`, errors);
          expectString(component.role, `${componentPath}.role`, errors);
          if ('materialRef' in component) {
            if (expectString(component.materialRef, `${componentPath}.materialRef`, errors) && materialIds.size > 0 && !materialIds.has(component.materialRef)) {
              pushError(errors, `${componentPath}.materialRef`, `references unknown material "${component.materialRef}"`);
            }
          }
        });
      }
    });
  }

  if (expectArray(multiscale.reactionRules, `${path}.reactionRules`, errors, { minItems: 1 })) {
    const reactionIds = new Set();
    multiscale.reactionRules.forEach((rule, index) => {
      const rulePath = `${path}.reactionRules[${index}]`;
      if (!expectRecord(rule, rulePath, errors)) return;
      expectAllowedKeys(rule, rulePath, ['id', 'when', 'observe', 'microNarrative'], ['materialRefs'], errors);

      if (expectString(rule.id, `${rulePath}.id`, errors)) {
        if (reactionIds.has(rule.id)) {
          pushError(errors, `${rulePath}.id`, `duplicate reaction rule id "${rule.id}"`);
        } else {
          reactionIds.add(rule.id);
        }
      }
      expectString(rule.when, `${rulePath}.when`, errors);
      expectString(rule.observe, `${rulePath}.observe`, errors);
      expectString(rule.microNarrative, `${rulePath}.microNarrative`, errors);

      if ('materialRefs' in rule) {
        validateStringArray(rule.materialRefs, `${rulePath}.materialRefs`, errors, { unique: true });
        if (Array.isArray(rule.materialRefs) && materialIds.size > 0) {
          rule.materialRefs.forEach((materialRef, materialIndex) => {
            if (typeof materialRef === 'string' && !materialIds.has(materialRef)) {
              pushError(errors, `${rulePath}.materialRefs[${materialIndex}]`, `references unknown material "${materialRef}"`);
            }
          });
        }
      }
    });
  }
}

export function validateExperimentConfig(config, options = {}) {
  const { fileName = 'unknown' } = options;
  const errors = [];
  const rootPath = fileName;

  if (!expectRecord(config, rootPath, errors)) {
    return errors;
  }

  expectAllowedKeys(
    config,
    rootPath,
    ['id', 'title', 'stage', 'subject', 'grade', 'durationMinutes', 'modes', 'scene', 'curriculum', 'productization', 'objectives', 'equipment', 'steps', 'scoring', 'feedback', 'capabilities'],
    ['multiscale'],
    errors,
  );

  if (expectString(config.id, `${rootPath}.id`, errors)) {
    if (!/^[a-z0-9-]+$/.test(config.id)) {
      pushError(errors, `${rootPath}.id`, 'must use lowercase kebab-style characters');
    }
  }
  expectString(config.title, `${rootPath}.title`, errors);
  if (expectString(config.stage, `${rootPath}.stage`, errors)) {
    expectEnum(config.stage, EDUCATION_STAGES, `${rootPath}.stage`, errors);
  }
  if (expectString(config.subject, `${rootPath}.subject`, errors)) {
    expectEnum(config.subject, SUBJECTS, `${rootPath}.subject`, errors);
  }
  expectString(config.grade, `${rootPath}.grade`, errors);
  expectInteger(config.durationMinutes, `${rootPath}.durationMinutes`, errors, { min: 1 });
  validateStringArray(config.modes, `${rootPath}.modes`, errors, { minItems: 1, unique: true, allowedValues: MODES });
  validateScene(config.scene, `${rootPath}.scene`, errors);
  validateCurriculum(config.curriculum, `${rootPath}.curriculum`, errors);
  validateProductization(config.productization, `${rootPath}.productization`, errors);
  validateStringArray(config.objectives, `${rootPath}.objectives`, errors, { minItems: 1 });

  validateStringArray(config.capabilities, `${rootPath}.capabilities`, errors, { minItems: 1, unique: true });
  const equipmentIds = validateEquipment(config.equipment, `${rootPath}.equipment`, errors);
  validateSteps(config.steps, `${rootPath}.steps`, errors, config.capabilities);
  validateScoring(config.scoring, `${rootPath}.scoring`, errors);
  validateFeedback(config.feedback, `${rootPath}.feedback`, errors);

  if ('multiscale' in config) {
    validateMultiscale(config.multiscale, `${rootPath}.multiscale`, errors, { equipmentIds });
  }

  return errors;
}

export function validateExperimentCollection(entries) {
  const errors = [];
  const experimentIds = new Map();

  entries.forEach((entry, index) => {
    const fileName = entry.fileName ?? `entry-${index}`;
    const configErrors = validateExperimentConfig(entry.config, { fileName });
    errors.push(...configErrors);

    const id = entry.config?.id;
    if (typeof id === 'string') {
      const previousFile = experimentIds.get(id);
      if (previousFile) {
        pushError(errors, fileName, `duplicate experiment id "${id}" also found in ${previousFile}`);
      } else {
        experimentIds.set(id, fileName);
      }
    }
  });

  return errors;
}

export function assertExperimentCollectionValid(entries) {
  const errors = validateExperimentCollection(entries);
  if (errors.length > 0) {
    throw new Error(`Experiment validation failed:\n- ${errors.join('\n- ')}`);
  }
}
