import type { ComponentType, LazyExoticComponent } from 'react';
import type { ExperimentConfig } from '../types/experiment';
import { createModulePreloader, lazyNamed } from './lazyNamedRetry';
import type { LabTelemetryInput } from './labTelemetry';
import type { SimulationRuntimeSnapshot } from './simulationRuntime';

export interface InteractiveExperimentPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

type ExperimentPlayerComponent = LazyExoticComponent<ComponentType<InteractiveExperimentPlayerProps>>;
type ExperimentPlayerModule = Record<string, unknown>;
type ExperimentPlayerPreloader = () => Promise<ExperimentPlayerModule>;

let playerRuntimeCoreStylesPromise: Promise<unknown> | null = null;
let playerRuntimeStylesPromise: Promise<unknown> | null = null;
const dedicatedExperimentPlayerPreloaders: Record<string, ExperimentPlayerPreloader> = {};

function loadPlayerRuntimeCoreStyles() {
  if (!playerRuntimeCoreStylesPromise) {
    playerRuntimeCoreStylesPromise = import('./playerRuntimeCoreStyles');
  }

  return playerRuntimeCoreStylesPromise;
}

function loadPlayerRuntimeStyles() {
  if (!playerRuntimeStylesPromise) {
    playerRuntimeStylesPromise = Promise.all([
      loadPlayerRuntimeCoreStyles(),
      import('./playerRuntimeStyles'),
    ]);
  }

  return playerRuntimeStylesPromise;
}

function lazyPlayer(
  loader: ExperimentPlayerPreloader,
  exportName: string,
  stylePreload: () => Promise<unknown> = loadPlayerRuntimeStyles,
): ExperimentPlayerComponent {
  return lazyNamed<InteractiveExperimentPlayerProps, ExperimentPlayerModule>(
    loader,
    exportName,
    { preload: stylePreload },
  );
}

function registerDedicatedPlayer(
  experimentId: string,
  loader: () => Promise<ExperimentPlayerModule>,
  exportName: string,
) {
  const preloader = createModulePreloader(loader);
  dedicatedExperimentPlayerPreloaders[experimentId] = preloader;
  return lazyPlayer(preloader, exportName);
}

const dedicatedExperimentPlayerRegistry: Record<string, ExperimentPlayerComponent> = {
  'phy-junior-circuit-001': registerDedicatedPlayer('phy-junior-circuit-001', () => import('../components/CircuitLabPlayer'), 'CircuitLabPlayer'),
  'bio-junior-microscope-001': registerDedicatedPlayer('bio-junior-microscope-001', () => import('../components/MicroscopeLabPlayer'), 'MicroscopeLabPlayer'),
  'chem-junior-oxygen-001': registerDedicatedPlayer('chem-junior-oxygen-001', () => import('../components/OxygenLabPlayer'), 'OxygenLabPlayer'),
  'bio-senior-enzyme-001': registerDedicatedPlayer('bio-senior-enzyme-001', () => import('../components/EnzymeLabPlayer'), 'EnzymeLabPlayer'),
  'phy-senior-ohm-001': registerDedicatedPlayer('phy-senior-ohm-001', () => import('../components/OhmLawLabPlayer'), 'OhmLawLabPlayer'),
  'chem-senior-galvanic-001': registerDedicatedPlayer('chem-senior-galvanic-001', () => import('../components/GalvanicCellLabPlayer'), 'GalvanicCellLabPlayer'),
  'phy-junior-convex-lens-001': registerDedicatedPlayer('phy-junior-convex-lens-001', () => import('../components/ConvexLensLabPlayer'), 'ConvexLensLabPlayer'),
  'phy-junior-density-001': registerDedicatedPlayer('phy-junior-density-001', () => import('../components/DensityLabPlayer'), 'DensityLabPlayer'),
  'chem-junior-acid-base-001': registerDedicatedPlayer('chem-junior-acid-base-001', () => import('../components/AcidBaseLabPlayer'), 'AcidBaseLabPlayer'),
  'phy-senior-refraction-001': registerDedicatedPlayer('phy-senior-refraction-001', () => import('../components/RefractionLabPlayer'), 'RefractionLabPlayer'),
  'bio-junior-transpiration-001': registerDedicatedPlayer('bio-junior-transpiration-001', () => import('../components/TranspirationLabPlayer'), 'TranspirationLabPlayer'),
  'chem-junior-carbon-dioxide-001': registerDedicatedPlayer('chem-junior-carbon-dioxide-001', () => import('../components/CarbonDioxideLabPlayer'), 'CarbonDioxideLabPlayer'),
  'bio-junior-photosynthesis-001': registerDedicatedPlayer('bio-junior-photosynthesis-001', () => import('../components/PhotosynthesisLabPlayer'), 'PhotosynthesisLabPlayer'),
  'bio-junior-phototropism-001': registerDedicatedPlayer('bio-junior-phototropism-001', () => import('../components/PhototropismLabPlayer'), 'PhototropismLabPlayer'),
  'bio-junior-oral-cell-001': registerDedicatedPlayer('bio-junior-oral-cell-001', () => import('../components/OralCellLabPlayer'), 'OralCellLabPlayer'),
  'bio-junior-onion-cell-001': registerDedicatedPlayer('bio-junior-onion-cell-001', () => import('../components/OnionCellLabPlayer'), 'OnionCellLabPlayer'),
  'bio-junior-stomata-001': registerDedicatedPlayer('bio-junior-stomata-001', () => import('../components/StomataLabPlayer'), 'StomataLabPlayer'),
  'phy-senior-acceleration-001': registerDedicatedPlayer('phy-senior-acceleration-001', () => import('../components/AccelerationLabPlayer'), 'AccelerationLabPlayer'),
  'chem-junior-filtration-001': registerDedicatedPlayer('chem-junior-filtration-001', () => import('../components/FiltrationLabPlayer'), 'FiltrationLabPlayer'),
  'bio-junior-germination-001': registerDedicatedPlayer('bio-junior-germination-001', () => import('../components/GerminationLabPlayer'), 'GerminationLabPlayer'),
  'chem-senior-titration-001': registerDedicatedPlayer('chem-senior-titration-001', () => import('../components/TitrationLabPlayer'), 'TitrationLabPlayer'),
  'sci-primary-air-space-001': registerDedicatedPlayer('sci-primary-air-space-001', () => import('../components/AirSpaceLabPlayer'), 'AirSpaceLabPlayer'),
  'sci-primary-air-pressure-001': registerDedicatedPlayer('sci-primary-air-pressure-001', () => import('../components/AirPressureLabPlayer'), 'AirPressureLabPlayer'),
  'sci-primary-heat-convection-001': registerDedicatedPlayer('sci-primary-heat-convection-001', () => import('../components/ConvectionLabPlayer'), 'ConvectionLabPlayer'),
  'sci-primary-static-electricity-001': registerDedicatedPlayer('sci-primary-static-electricity-001', () => import('../components/StaticElectricityLabPlayer'), 'StaticElectricityLabPlayer'),
  'sci-primary-magnet-001': registerDedicatedPlayer('sci-primary-magnet-001', () => import('../components/MagnetLabPlayer'), 'MagnetLabPlayer'),
  'sci-primary-shadow-001': registerDedicatedPlayer('sci-primary-shadow-001', () => import('../components/ShadowLabPlayer'), 'ShadowLabPlayer'),
  'sci-primary-solubility-001': registerDedicatedPlayer('sci-primary-solubility-001', () => import('../components/SolubilityLabPlayer'), 'SolubilityLabPlayer'),
  'sci-primary-thermal-expansion-001': registerDedicatedPlayer('sci-primary-thermal-expansion-001', () => import('../components/ThermalExpansionLabPlayer'), 'ThermalExpansionLabPlayer'),
  'phy-junior-pressure-001': registerDedicatedPlayer('phy-junior-pressure-001', () => import('../components/PressureLabPlayer'), 'PressureLabPlayer'),
  'phy-junior-variable-resistor-001': registerDedicatedPlayer('phy-junior-variable-resistor-001', () => import('../components/VariableResistorLabPlayer'), 'VariableResistorLabPlayer'),
  'phy-junior-buoyancy-001': registerDedicatedPlayer('phy-junior-buoyancy-001', () => import('../components/BuoyancyLabPlayer'), 'BuoyancyLabPlayer'),
  'phy-junior-balance-forces-001': registerDedicatedPlayer('phy-junior-balance-forces-001', () => import('../components/BalanceForcesLabPlayer'), 'BalanceForcesLabPlayer'),
  'phy-junior-inertia-001': registerDedicatedPlayer('phy-junior-inertia-001', () => import('../components/InertiaLabPlayer'), 'InertiaLabPlayer'),
  'sci-primary-circuit-001': registerDedicatedPlayer('sci-primary-circuit-001', () => import('../components/PrimaryCircuitLabPlayer'), 'PrimaryCircuitLabPlayer'),
  'sci-primary-evaporation-001': registerDedicatedPlayer('sci-primary-evaporation-001', () => import('../components/EvaporationLabPlayer'), 'EvaporationLabPlayer'),
  'bio-senior-osmosis-001': registerDedicatedPlayer('bio-senior-osmosis-001', () => import('../components/OsmosisLabPlayer'), 'OsmosisLabPlayer'),
  'chem-senior-rate-001': registerDedicatedPlayer('chem-senior-rate-001', () => import('../components/ReactionRateLabPlayer'), 'ReactionRateLabPlayer'),
  'sci-primary-floating-sinking-001': registerDedicatedPlayer('sci-primary-floating-sinking-001', () => import('../components/FloatingSinkingLabPlayer'), 'FloatingSinkingLabPlayer'),
  'sci-primary-sound-vibration-001': registerDedicatedPlayer('sci-primary-sound-vibration-001', () => import('../components/SoundVibrationLabPlayer'), 'SoundVibrationLabPlayer'),
  'bio-senior-mitosis-001': registerDedicatedPlayer('bio-senior-mitosis-001', () => import('../components/MitosisLabPlayer'), 'MitosisLabPlayer'),
  'sci-primary-lever-001': registerDedicatedPlayer('sci-primary-lever-001', () => import('../components/LeverLabPlayer'), 'LeverLabPlayer'),
  'bio-junior-respiration-001': registerDedicatedPlayer('bio-junior-respiration-001', () => import('../components/RespirationLabPlayer'), 'RespirationLabPlayer'),
  'phy-junior-plane-mirror-001': registerDedicatedPlayer('phy-junior-plane-mirror-001', () => import('../components/PlaneMirrorLabPlayer'), 'PlaneMirrorLabPlayer'),
  'phy-junior-reflection-001': registerDedicatedPlayer('phy-junior-reflection-001', () => import('../components/ReflectionLawLabPlayer'), 'ReflectionLawLabPlayer'),
  'phy-senior-induction-001': registerDedicatedPlayer('phy-senior-induction-001', () => import('../components/InductionLabPlayer'), 'InductionLabPlayer'),
  'chem-junior-combustion-001': registerDedicatedPlayer('chem-junior-combustion-001', () => import('../components/CombustionLabPlayer'), 'CombustionLabPlayer'),
  'phy-junior-electromagnet-001': registerDedicatedPlayer('phy-junior-electromagnet-001', () => import('../components/ElectromagnetLabPlayer'), 'ElectromagnetLabPlayer'),
  'sci-primary-pulley-001': registerDedicatedPlayer('sci-primary-pulley-001', () => import('../components/PulleyLabPlayer'), 'PulleyLabPlayer'),
  'sci-primary-conductivity-001': registerDedicatedPlayer('sci-primary-conductivity-001', () => import('../components/ConductivityLabPlayer'), 'ConductivityLabPlayer'),
  'sci-primary-friction-001': registerDedicatedPlayer('sci-primary-friction-001', () => import('../components/FrictionLabPlayer'), 'FrictionLabPlayer'),
  'bio-junior-heart-rate-001': registerDedicatedPlayer('bio-junior-heart-rate-001', () => import('../components/HeartRateLabPlayer'), 'HeartRateLabPlayer'),
  'chem-junior-crystallization-001': registerDedicatedPlayer('chem-junior-crystallization-001', () => import('../components/CrystallizationLabPlayer'), 'CrystallizationLabPlayer'),
  'chem-junior-extinguishing-001': registerDedicatedPlayer('chem-junior-extinguishing-001', () => import('../components/ExtinguishingLabPlayer'), 'ExtinguishingLabPlayer'),
  'chem-junior-rusting-001': registerDedicatedPlayer('chem-junior-rusting-001', () => import('../components/RustingLabPlayer'), 'RustingLabPlayer'),
  'chem-junior-mass-conservation-001': registerDedicatedPlayer('chem-junior-mass-conservation-001', () => import('../components/MassConservationLabPlayer'), 'MassConservationLabPlayer'),
  'chem-junior-metal-acid-001': registerDedicatedPlayer('chem-junior-metal-acid-001', () => import('../components/MetalAcidLabPlayer'), 'MetalAcidLabPlayer'),
  'sci-primary-thermal-conduction-001': registerDedicatedPlayer('sci-primary-thermal-conduction-001', () => import('../components/ThermalConductionLabPlayer'), 'ThermalConductionLabPlayer'),
  'phy-junior-boiling-001': registerDedicatedPlayer('phy-junior-boiling-001', () => import('../components/BoilingLabPlayer'), 'BoilingLabPlayer'),
  'bio-junior-fish-circulation-001': registerDedicatedPlayer('bio-junior-fish-circulation-001', () => import('../components/FishCirculationLabPlayer'), 'FishCirculationLabPlayer'),
  'sci-primary-pendulum-001': registerDedicatedPlayer('sci-primary-pendulum-001', () => import('../components/PendulumLabPlayer'), 'PendulumLabPlayer'),
  'chem-junior-dissolution-temperature-001': registerDedicatedPlayer('chem-junior-dissolution-temperature-001', () => import('../components/DissolutionTemperatureLabPlayer'), 'DissolutionTemperatureLabPlayer'),
  'phy-junior-melting-001': registerDedicatedPlayer('phy-junior-melting-001', () => import('../components/MeltingLabPlayer'), 'MeltingLabPlayer'),
  'phy-junior-sound-medium-001': registerDedicatedPlayer('phy-junior-sound-medium-001', () => import('../components/SoundMediumLabPlayer'), 'SoundMediumLabPlayer'),
  'chem-junior-solution-preparation-001': registerDedicatedPlayer('chem-junior-solution-preparation-001', () => import('../components/SolutionPreparationLabPlayer'), 'SolutionPreparationLabPlayer'),
  'bio-junior-paramecium-001': registerDedicatedPlayer('bio-junior-paramecium-001', () => import('../components/ParameciumLabPlayer'), 'ParameciumLabPlayer'),
  'phy-junior-dispersion-001': registerDedicatedPlayer('phy-junior-dispersion-001', () => import('../components/PrismDispersionLabPlayer'), 'PrismDispersionLabPlayer'),
  'phy-junior-liquid-density-001': registerDedicatedPlayer('phy-junior-liquid-density-001', () => import('../components/LiquidDensityLabPlayer'), 'LiquidDensityLabPlayer'),
  'bio-junior-fermentation-001': registerDedicatedPlayer('bio-junior-fermentation-001', () => import('../components/FermentationLabPlayer'), 'FermentationLabPlayer'),
  'chem-junior-molecule-motion-001': registerDedicatedPlayer('chem-junior-molecule-motion-001', () => import('../components/MoleculeMotionLabPlayer'), 'MoleculeMotionLabPlayer'),
  'bio-junior-saliva-digestion-001': registerDedicatedPlayer('bio-junior-saliva-digestion-001', () => import('../components/SalivaDigestionLabPlayer'), 'SalivaDigestionLabPlayer'),
  'phy-junior-solid-pressure-001': registerDedicatedPlayer('phy-junior-solid-pressure-001', () => import('../components/SolidPressureLabPlayer'), 'SolidPressureLabPlayer'),
  'chem-junior-electrolysis-water-001': registerDedicatedPlayer('chem-junior-electrolysis-water-001', () => import('../components/ElectrolysisWaterLabPlayer'), 'ElectrolysisWaterLabPlayer'),
  'bio-junior-breath-gas-001': registerDedicatedPlayer('bio-junior-breath-gas-001', () => import('../components/BreathGasLabPlayer'), 'BreathGasLabPlayer'),
  'bio-junior-seed-structure-001': registerDedicatedPlayer('bio-junior-seed-structure-001', () => import('../components/SeedStructureLabPlayer'), 'SeedStructureLabPlayer'),
  'phy-junior-gravity-001': registerDedicatedPlayer('phy-junior-gravity-001', () => import('../components/GravityLawLabPlayer'), 'GravityLawLabPlayer'),
  'chem-junior-rough-salt-001': registerDedicatedPlayer('chem-junior-rough-salt-001', () => import('../components/RoughSaltLabPlayer'), 'RoughSaltLabPlayer'),
  'sci-primary-surface-tension-001': registerDedicatedPlayer('sci-primary-surface-tension-001', () => import('../components/SurfaceTensionLabPlayer'), 'SurfaceTensionLabPlayer'),
  'chem-junior-distillation-001': registerDedicatedPlayer('chem-junior-distillation-001', () => import('../components/DistillationLabPlayer'), 'DistillationLabPlayer'),
  'phy-junior-average-speed-001': registerDedicatedPlayer('phy-junior-average-speed-001', () => import('../components/AverageSpeedLabPlayer'), 'AverageSpeedLabPlayer'),
  'bio-junior-yeast-budding-001': registerDedicatedPlayer('bio-junior-yeast-budding-001', () => import('../components/YeastBuddingLabPlayer'), 'YeastBuddingLabPlayer'),
  'sci-primary-incline-001': registerDedicatedPlayer('sci-primary-incline-001', () => import('../components/InclineLabPlayer'), 'InclineLabPlayer'),
  'phy-junior-parallel-circuit-001': registerDedicatedPlayer('phy-junior-parallel-circuit-001', () => import('../components/ParallelCircuitLabPlayer'), 'ParallelCircuitLabPlayer'),
  'chem-junior-hydrogen-preparation-001': registerDedicatedPlayer('chem-junior-hydrogen-preparation-001', () => import('../components/HydrogenPreparationLabPlayer'), 'HydrogenPreparationLabPlayer'),
  'phy-junior-liquid-pressure-001': registerDedicatedPlayer('phy-junior-liquid-pressure-001', () => import('../components/LiquidPressureLabPlayer'), 'LiquidPressureLabPlayer'),
  'bio-junior-blood-smear-001': registerDedicatedPlayer('bio-junior-blood-smear-001', () => import('../components/BloodSmearLabPlayer'), 'BloodSmearLabPlayer'),
  'sci-primary-wheel-axle-001': registerDedicatedPlayer('sci-primary-wheel-axle-001', () => import('../components/WheelAxleLabPlayer'), 'WheelAxleLabPlayer'),
  'phy-junior-friction-factors-001': registerDedicatedPlayer('phy-junior-friction-factors-001', () => import('../components/FrictionFactorsLabPlayer'), 'FrictionFactorsLabPlayer'),
  'phy-junior-lever-balance-001': registerDedicatedPlayer('phy-junior-lever-balance-001', () => import('../components/LeverBalanceLabPlayer'), 'LeverBalanceLabPlayer'),
  'chem-junior-indicator-001': registerDedicatedPlayer('chem-junior-indicator-001', () => import('../components/IndicatorLabPlayer'), 'IndicatorLabPlayer'),
  'bio-junior-plasmolysis-001': registerDedicatedPlayer('bio-junior-plasmolysis-001', () => import('../components/PlasmolysisLabPlayer'), 'PlasmolysisLabPlayer'),
  'sci-primary-periscope-001': registerDedicatedPlayer('sci-primary-periscope-001', () => import('../components/PeriscopeLabPlayer'), 'PeriscopeLabPlayer'),
  'chem-junior-precipitation-001': registerDedicatedPlayer('chem-junior-precipitation-001', () => import('../components/PrecipitationLabPlayer'), 'PrecipitationLabPlayer'),
  'sci-primary-light-straight-001': registerDedicatedPlayer('sci-primary-light-straight-001', () => import('../components/LightStraightLabPlayer'), 'LightStraightLabPlayer'),
  'phy-junior-magnetic-field-lines-001': registerDedicatedPlayer('phy-junior-magnetic-field-lines-001', () => import('../components/MagneticFieldLinesLabPlayer'), 'MagneticFieldLinesLabPlayer'),
  'chem-junior-ph-paper-001': registerDedicatedPlayer('chem-junior-ph-paper-001', () => import('../components/PhPaperLabPlayer'), 'PhPaperLabPlayer'),
  'bio-junior-pigment-separation-001': registerDedicatedPlayer('bio-junior-pigment-separation-001', () => import('../components/PigmentSeparationLabPlayer'), 'PigmentSeparationLabPlayer'),
  'bio-senior-dna-extraction-001': registerDedicatedPlayer('bio-senior-dna-extraction-001', () => import('../components/DNAExtractionLabPlayer'), 'DNAExtractionLabPlayer'),
  'sci-primary-pinhole-imaging-001': registerDedicatedPlayer('sci-primary-pinhole-imaging-001', () => import('../components/PinholeImagingLabPlayer'), 'PinholeImagingLabPlayer'),
  'sci-primary-color-wheel-001': registerDedicatedPlayer('sci-primary-color-wheel-001', () => import('../components/ColorWheelLabPlayer'), 'ColorWheelLabPlayer'),
  'chem-junior-starch-test-001': registerDedicatedPlayer('chem-junior-starch-test-001', () => import('../components/StarchTestLabPlayer'), 'StarchTestLabPlayer'),
  'sci-primary-capillary-action-001': registerDedicatedPlayer('sci-primary-capillary-action-001', () => import('../components/CapillaryActionLabPlayer'), 'CapillaryActionLabPlayer'),
  'bio-junior-stem-transport-001': registerDedicatedPlayer('bio-junior-stem-transport-001', () => import('../components/StemTransportLabPlayer'), 'StemTransportLabPlayer'),
  'phy-junior-sound-vacuum-001': registerDedicatedPlayer('phy-junior-sound-vacuum-001', () => import('../components/SoundVacuumLabPlayer'), 'SoundVacuumLabPlayer'),
  'phy-junior-refraction-coin-001': registerDedicatedPlayer('phy-junior-refraction-coin-001', () => import('../components/RefractionCoinLabPlayer'), 'RefractionCoinLabPlayer'),
  'chem-junior-copper-sulfate-hydrate-001': registerDedicatedPlayer('chem-junior-copper-sulfate-hydrate-001', () => import('../components/HydratedCopperSulfateLabPlayer'), 'HydratedCopperSulfateLabPlayer'),
  'bio-junior-potato-osmosis-001': registerDedicatedPlayer('bio-junior-potato-osmosis-001', () => import('../components/PotatoOsmosisLabPlayer'), 'PotatoOsmosisLabPlayer'),
  'sci-primary-siphon-001': registerDedicatedPlayer('sci-primary-siphon-001', () => import('../components/SiphonLabPlayer'), 'SiphonLabPlayer'),
  'chem-junior-cabbage-indicator-001': registerDedicatedPlayer('chem-junior-cabbage-indicator-001', () => import('../components/CabbageIndicatorLabPlayer'), 'CabbageIndicatorLabPlayer'),
  'chem-senior-copper-complex-001': registerDedicatedPlayer('chem-senior-copper-complex-001', () => import('../components/CopperComplexLabPlayer'), 'CopperComplexLabPlayer'),
  'chem-senior-permanganate-peroxide-001': registerDedicatedPlayer('chem-senior-permanganate-peroxide-001', () => import('../components/PermanganatePeroxideLabPlayer'), 'PermanganatePeroxideLabPlayer'),
  'chem-senior-flame-test-001': registerDedicatedPlayer('chem-senior-flame-test-001', () => import('../components/FlameTestLabPlayer'), 'FlameTestLabPlayer'),
  'chem-senior-ferric-thiocyanate-001': registerDedicatedPlayer('chem-senior-ferric-thiocyanate-001', () => import('../components/FerricThiocyanateLabPlayer'), 'FerricThiocyanateLabPlayer'),
  'chem-senior-silver-mirror-001': registerDedicatedPlayer('chem-senior-silver-mirror-001', () => import('../components/SilverMirrorLabPlayer'), 'SilverMirrorLabPlayer'),
  'chem-senior-iodine-clock-001': registerDedicatedPlayer('chem-senior-iodine-clock-001', () => import('../components/IodineClockLabPlayer'), 'IodineClockLabPlayer'),
  'chem-senior-golden-rain-001': registerDedicatedPlayer('chem-senior-golden-rain-001', () => import('../components/GoldenRainLabPlayer'), 'GoldenRainLabPlayer'),
  'chem-junior-iron-copper-replacement-001': registerDedicatedPlayer('chem-junior-iron-copper-replacement-001', () => import('../components/IronCopperReplacementLabPlayer'), 'IronCopperReplacementLabPlayer'),
  'chem-senior-glucose-cuoh2-001': registerDedicatedPlayer('chem-senior-glucose-cuoh2-001', () => import('../components/GlucoseCuOH2LabPlayer'), 'GlucoseCuOH2LabPlayer'),
  'chem-junior-limewater-co2-001': registerDedicatedPlayer('chem-junior-limewater-co2-001', () => import('../components/LimewaterCo2LabPlayer'), 'LimewaterCo2LabPlayer'),
  'chem-junior-phenolphthalein-cycle-001': registerDedicatedPlayer('chem-junior-phenolphthalein-cycle-001', () => import('../components/PhenolphthaleinCycleLabPlayer'), 'PhenolphthaleinCycleLabPlayer'),
  'chem-senior-blue-bottle-001': registerDedicatedPlayer('chem-senior-blue-bottle-001', () => import('../components/BlueBottleLabPlayer'), 'BlueBottleLabPlayer'),
  'chem-senior-elephant-toothpaste-001': registerDedicatedPlayer('chem-senior-elephant-toothpaste-001', () => import('../components/ElephantToothpasteLabPlayer'), 'ElephantToothpasteLabPlayer'),
  'chem-senior-ammonia-fountain-001': registerDedicatedPlayer('chem-senior-ammonia-fountain-001', () => import('../components/AmmoniaFountainLabPlayer'), 'AmmoniaFountainLabPlayer'),
  'chem-senior-luminol-glow-001': registerDedicatedPlayer('chem-senior-luminol-glow-001', () => import('../components/LuminolGlowLabPlayer'), 'LuminolGlowLabPlayer'),
  'chem-senior-chromate-equilibrium-001': registerDedicatedPlayer('chem-senior-chromate-equilibrium-001', () => import('../components/ChromateEquilibriumLabPlayer'), 'ChromateEquilibriumLabPlayer'),
  'chem-senior-cobalt-chloride-cycle-001': registerDedicatedPlayer('chem-senior-cobalt-chloride-cycle-001', () => import('../components/CobaltChlorideCycleLabPlayer'), 'CobaltChlorideCycleLabPlayer'),
  'chem-senior-copper-silver-replacement-001': registerDedicatedPlayer('chem-senior-copper-silver-replacement-001', () => import('../components/CopperSilverReplacementLabPlayer'), 'CopperSilverReplacementLabPlayer'),
  'chem-senior-iodine-sublimation-001': registerDedicatedPlayer('chem-senior-iodine-sublimation-001', () => import('../components/IodineSublimationLabPlayer'), 'IodineSublimationLabPlayer'),
  'chem-senior-no2-equilibrium-001': registerDedicatedPlayer('chem-senior-no2-equilibrium-001', () => import('../components/No2EquilibriumLabPlayer'), 'No2EquilibriumLabPlayer'),
  'chem-senior-ammonia-hcl-smoke-ring-001': registerDedicatedPlayer('chem-senior-ammonia-hcl-smoke-ring-001', () => import('../components/AmmoniaHclSmokeLabPlayer'), 'AmmoniaHclSmokeLabPlayer'),
  'chem-senior-copper-sulfate-crystal-001': registerDedicatedPlayer('chem-senior-copper-sulfate-crystal-001', () => import('../components/CopperSulfateCrystalLabPlayer'), 'CopperSulfateCrystalLabPlayer'),
  'chem-junior-universal-indicator-rainbow-001': registerDedicatedPlayer('chem-junior-universal-indicator-rainbow-001', () => import('../components/UniversalIndicatorRainbowLabPlayer'), 'UniversalIndicatorRainbowLabPlayer'),
  'chem-senior-disappearing-cross-001': registerDedicatedPlayer('chem-senior-disappearing-cross-001', () => import('../components/DisappearingCrossLabPlayer'), 'DisappearingCrossLabPlayer'),
};

const preloadGenericLabPlayer = createModulePreloader(() => import('../components/GenericLabPlayer'));
const GenericLabPlayer = lazyPlayer(preloadGenericLabPlayer, 'GenericLabPlayer', loadPlayerRuntimeCoreStyles);

export function getExperimentPlayer(experiment?: ExperimentConfig | null) {
  if (!experiment) return null;
  return dedicatedExperimentPlayerRegistry[experiment.id] ?? (experiment.productization.status !== '规划中' ? GenericLabPlayer : null);
}

export function getDedicatedExperimentIds() {
  return Object.keys(dedicatedExperimentPlayerRegistry);
}

export function hasDedicatedExperimentPlayer(experimentId: string) {
  return Object.prototype.hasOwnProperty.call(dedicatedExperimentPlayerRegistry, experimentId);
}

export async function preloadExperimentPlayerById(experimentId: string, allowGenericPlayer = false) {
  const hasDedicatedPlayer = hasDedicatedExperimentPlayer(experimentId);
  const preloadDedicatedPlayer = hasDedicatedPlayer ? dedicatedExperimentPlayerPreloaders[experimentId] : null;
  const preloadPlayer = preloadDedicatedPlayer ?? (allowGenericPlayer ? preloadGenericLabPlayer : null);
  if (!preloadPlayer) return;

  await Promise.all([
    hasDedicatedPlayer ? loadPlayerRuntimeStyles() : loadPlayerRuntimeCoreStyles(),
    preloadPlayer(),
  ]);
}
