import macro from 'vtk.js/Sources/macro';
import vtkBoundingBox from 'vtk.js/Sources/Common/DataModel/BoundingBox';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';

import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';

import vtkAbstractRepresentation from './AbstractRepresentation';

const PROPERTIES_UI = [
  {
    name: 'volumeVisibility',
    label: 'Volume Visibility',
    doc: 'Toggle visibility of the Volume',
    widget: 'checkbox',
    type: 'boolean',
    advanced: 1,
    size: 1,
  },
  {
    name: 'sliceVisibility',
    label: 'Slices Visibility',
    doc: 'Toggle visibility of the Slices',
    widget: 'checkbox',
    type: 'boolean',
    advanced: 1,
    size: 1,
  },
  {
    label: 'Color Window',
    name: 'colorWindow',
    widget: 'slider',
    type: 'integer',
    size: 1,
    domain: { min: 0, max: 255, step: 1 },
  },
  {
    label: 'Color Level',
    name: 'colorLevel',
    widget: 'slider',
    type: 'integer',
    size: 1,
    domain: { min: 0, max: 255, step: 1 },
  },
  {
    label: 'SliceX',
    name: 'xSliceIndex',
    widget: 'slider',
    type: 'integer',
    size: 1,
    domain: { min: 0, max: 255, step: 1 },
  },
  {
    label: 'SliceY',
    name: 'ySliceIndex',
    widget: 'slider',
    type: 'integer',
    size: 1,
    domain: { min: 0, max: 255, step: 1 },
  },
  {
    label: 'SliceZ',
    name: 'zSliceIndex',
    widget: 'slider',
    type: 'integer',
    size: 1,
    domain: { min: 0, max: 255, step: 1 },
  },
];

function sum(a, b) {
  return a + b;
}

function mean(...array) {
  return array.reduce(sum, 0) / array.length;
}

function updateDomains(dataset, updateProp) {
  const dataArray =
    dataset.getPointData().getScalars() ||
    dataset.getPointData().getArrays()[0];
  const dataRange = dataArray.getRange();
  const extent = dataset.getExtent();

  const propToUpdate = {
    xSliceIndex: {
      domain: {
        min: extent[0],
        max: extent[1],
        step: 1,
      },
    },
    ySliceIndex: {
      domain: {
        min: extent[2],
        max: extent[3],
        step: 1,
      },
    },
    zSliceIndex: {
      domain: {
        min: extent[4],
        max: extent[5],
        step: 1,
      },
    },
    colorWindow: {
      domain: {
        min: 0,
        max: dataRange[1] - dataRange[0],
        step: 'any',
      },
    },
    colorLevel: {
      domain: {
        min: dataRange[0],
        max: dataRange[1],
        step: 'any',
      },
    },
  };

  updateProp('xSliceIndex', propToUpdate.xSliceIndex);
  updateProp('ySliceIndex', propToUpdate.ySliceIndex);
  updateProp('zSliceIndex', propToUpdate.zSliceIndex);
  updateProp('colorWindow', propToUpdate.colorWindow);
  updateProp('colorLevel', propToUpdate.colorLevel);

  return {
    xSliceIndex: Math.floor(
      mean(
        propToUpdate.xSliceIndex.domain.min,
        propToUpdate.xSliceIndex.domain.max
      )
    ),
    ySliceIndex: Math.floor(
      mean(
        propToUpdate.ySliceIndex.domain.min,
        propToUpdate.ySliceIndex.domain.max
      )
    ),
    zSliceIndex: Math.floor(
      mean(
        propToUpdate.zSliceIndex.domain.min,
        propToUpdate.zSliceIndex.domain.max
      )
    ),
    colorWindow: propToUpdate.colorWindow.domain.max,
    colorLevel: Math.floor(
      mean(
        propToUpdate.colorLevel.domain.min,
        propToUpdate.colorWindow.domain.max
      )
    ),
  };
}

function updateConfiguration(
  dataset,
  { lookupTable, piecewiseFunction, mapper, property }
) {
  const dataArray =
    dataset.getPointData().getScalars() ||
    dataset.getPointData().getArrays()[0];
  const dataRange = dataArray.getRange();

  // FIXME ---- start ---------------------------------------------------------
  const preset = vtkColorMaps.getPresetByName('erdc_rainbow_bright');
  lookupTable.applyColorMap(preset);
  lookupTable.setMappingRange(...dataRange);
  lookupTable.updateRange();

  const midpoint = 0.5;
  const sharpness = 0;
  const nodes = [
    { x: dataRange[0], y: 0, midpoint, sharpness },
    { x: dataRange[1], y: 1, midpoint, sharpness },
  ];
  piecewiseFunction.removeAllPoints();
  piecewiseFunction.set({ nodes }, true);
  piecewiseFunction.sortAndUpdateRange();
  // FIXME ---- end -----------------------------------------------------------

  // Configuration
  const sampleDistance =
    0.7 *
    Math.sqrt(
      dataset
        .getSpacing()
        .map((v) => v * v)
        .reduce((a, b) => a + b, 0)
    );
  mapper.setSampleDistance(sampleDistance);
  property.setRGBTransferFunction(0, lookupTable);
  property.setScalarOpacity(0, piecewiseFunction);
  // actor.getProperty().setInterpolationTypeToFastLinear();
  property.setInterpolationTypeToLinear();

  // For better looking volume rendering
  // - distance in world coordinates a scalar opacity of 1.0
  property.setScalarOpacityUnitDistance(
    0,
    vtkBoundingBox.getDiagonalLength(dataset.getBounds()) /
      Math.max(...dataset.getDimensions())
  );
  // - control how we emphasize surface boundaries
  //  => max should be around the average gradient magnitude for the
  //     volume or maybe average plus one std dev of the gradient magnitude
  //     (adjusted for spacing, this is a world coordinate gradient, not a
  //     pixel gradient)
  //  => max hack: (dataRange[1] - dataRange[0]) * 0.05
  property.setGradientOpacityMinimumValue(0, 0);
  property.setGradientOpacityMaximumValue(
    0,
    (dataRange[1] - dataRange[0]) * 0.05
  );
  // - Use shading based on gradient
  property.setShade(true);
  property.setUseGradientOpacity(0, true);
  // - generic good default
  property.setGradientOpacityMinimumOpacity(0, 0.0);
  property.setGradientOpacityMaximumOpacity(0, 1.0);
  property.setAmbient(0.2);
  property.setDiffuse(0.7);
  property.setSpecular(0.3);
  property.setSpecularPower(8.0);
}

// ----------------------------------------------------------------------------
// vtkVolumeRepresentation methods
// ----------------------------------------------------------------------------

function vtkVolumeRepresentation(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkVolumeRepresentation');
  const superSetInput = publicAPI.setInput;

  // FIXME
  model.lookupTable = vtkColorTransferFunction.newInstance();
  model.piecewiseFunction = vtkPiecewiseFunction.newInstance();

  // Volume
  model.mapper = vtkVolumeMapper.newInstance();
  model.volume = vtkVolume.newInstance();
  model.property = model.volume.getProperty();

  // Slices
  model.mapperX = vtkImageMapper.newInstance({
    currentSlicingMode: vtkImageMapper.SlicingMode.X,
  });
  model.actorX = vtkImageSlice.newInstance();
  model.propertySlices = model.actorX.getProperty();
  model.mapperY = vtkImageMapper.newInstance({
    currentSlicingMode: vtkImageMapper.SlicingMode.Y,
  });
  model.actorY = vtkImageSlice.newInstance({ property: model.propertySlices });
  model.mapperZ = vtkImageMapper.newInstance({
    currentSlicingMode: vtkImageMapper.SlicingMode.Z,
  });
  model.actorZ = vtkImageSlice.newInstance({ property: model.propertySlices });

  // API ----------------------------------------------------------------------

  publicAPI.setInput = (source) => {
    superSetInput(source);

    vtkAbstractRepresentation.connectMapper(model.mapper, source);
    updateConfiguration(publicAPI.getInputDataSet(), model);

    // Update domains
    const state = updateDomains(
      publicAPI.getInputDataSet(),
      publicAPI.updateProxyProperty
    );
    publicAPI.set(state);

    // connect rendering pipeline
    model.volume.setMapper(model.mapper);
    model.volumes.push(model.volume);

    // Connect slice pipeline
    vtkAbstractRepresentation.connectMapper(model.mapperX, source);
    model.actorX.setMapper(model.mapperX);
    model.actors.push(model.actorX);
    vtkAbstractRepresentation.connectMapper(model.mapperY, source);
    model.actorY.setMapper(model.mapperY);
    model.actors.push(model.actorY);
    vtkAbstractRepresentation.connectMapper(model.mapperZ, source);
    model.actorZ.setMapper(model.mapperZ);
    model.actors.push(model.actorZ);

    // Create a link handler on source
    source.getPropertyLink('SliceX').bind(publicAPI, 'xSliceIndex');
    source.getPropertyLink('SliceY').bind(publicAPI, 'ySliceIndex');
    source.getPropertyLink('SliceZ').bind(publicAPI, 'zSliceIndex');
    source.getPropertyLink('ColorWindow').bind(publicAPI, 'colorWindow');
    source.getPropertyLink('ColorLevel').bind(publicAPI, 'colorLevel');
  };

  publicAPI.isVisible = () => model.volume.getVisibility();

  publicAPI.setVolumeVisibility = model.volume.setVisibility;
  publicAPI.getVolumeVisibility = model.volume.getVisibility;

  publicAPI.setSliceVisibility = macro.chain(
    model.actorX.setVisibility,
    model.actorY.setVisibility,
    model.actorZ.setVisibility
  );
  publicAPI.getSliceVisibility = model.actorX.getVisibility;
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Object methods
  vtkAbstractRepresentation.extend(publicAPI, model);
  macro.setGet(publicAPI, model, ['lookupTable', 'piecewiseFunction']);

  // Object specific methods
  vtkVolumeRepresentation(publicAPI, model);
  macro.proxy(publicAPI, model, 'Volume Representation', PROPERTIES_UI);
  macro.proxyPropertyMapping(publicAPI, model, {
    xSliceIndex: { modelKey: 'mapperX', property: 'xSlice' },
    ySliceIndex: { modelKey: 'mapperY', property: 'ySlice' },
    zSliceIndex: { modelKey: 'mapperZ', property: 'zSlice' },
    colorWindow: { modelKey: 'propertySlices', property: 'colorWindow' },
    colorLevel: { modelKey: 'propertySlices', property: 'colorLevel' },
  });
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkVolumeRepresentation');

// ----------------------------------------------------------------------------

export default { newInstance, extend, updateConfiguration };