/**
 * @module ol/layer/Layer
 */
import {listen, unlistenByKey} from '../events.js';
import EventType from '../events/EventType.js';
import {getChangeEventType} from '../Object.js';
import BaseLayer from './Base.js';
import LayerProperty from './Property.js';
import {assign} from '../obj.js';
import RenderEventType from '../render/EventType.js';
import SourceState from '../source/State.js';

/**
 * @typedef {function(import("../PluggableMap.js").FrameState):HTMLElement} RenderFunction
 */


/**
 * @typedef {Object} Options
 * @property {number} [opacity=1] Opacity (0, 1).
 * @property {boolean} [visible=true] Visibility.
 * @property {import("../extent.js").Extent} [extent] The bounding extent for layer rendering.  The layer will not be
 * rendered outside of this extent.
 * @property {number} [zIndex] The z-index for layer rendering.  At rendering time, the layers
 * will be ordered, first by Z-index and then by position. When `undefined`, a `zIndex` of 0 is assumed
 * for layers that are added to the map's `layers` collection, or `Infinity` when the layer's `setMap()`
 * method was used.
 * @property {number} [minResolution] The minimum resolution (inclusive) at which this layer will be
 * visible.
 * @property {number} [maxResolution] The maximum resolution (exclusive) below which this layer will
 * be visible.
 * @property {import("../source/Source.js").default} [source] Source for this layer.  If not provided to the constructor,
 * the source can be set by calling {@link module:ol/layer/Layer#setSource layer.setSource(source)} after
 * construction.
 * @property {import("../PluggableMap.js").default} [map] Map.
 * @property {RenderFunction} [render] Render function. Takes the frame state as input and is expected to return an
 * HTML element. Will overwrite the default rendering for the layer.
 */


/**
 * @typedef {Object} State
 * @property {import("./Base.js").default} layer
 * @property {number} opacity Opacity, the value is rounded to two digits to appear after the decimal point.
 * @property {SourceState} sourceState
 * @property {boolean} visible
 * @property {boolean} managed
 * @property {import("../extent.js").Extent} [extent]
 * @property {number} zIndex
 * @property {number} maxResolution
 * @property {number} minResolution
 */

/**
 * @classdesc
 * Base class from which all layer types are derived. This should only be instantiated
 * in the case where a custom layer is be added to the map with a custom `render` function.
 * Such a function can be specified in the `options` object, and is expected to return an HTML element.
 *
 * A visual representation of raster or vector map data.
 * Layers group together those properties that pertain to how the data is to be
 * displayed, irrespective of the source of that data.
 *
 * Layers are usually added to a map with {@link module:ol/Map#addLayer}. Components
 * like {@link module:ol/interaction/Select~Select} use unmanaged layers
 * internally. These unmanaged layers are associated with the map using
 * {@link module:ol/layer/Layer~Layer#setMap} instead.
 *
 * A generic `change` event is fired when the state of the source changes.
 *
 * @fires import("../render/Event.js").RenderEvent#prerender
 * @fires import("../render/Event.js").RenderEvent#postrender
 *
 * @template {import("../source/Source.js").default} SourceType
 * @api
 */
class Layer extends BaseLayer {
  /**
   * @param {Options} options Layer options.
   */
  constructor(options) {

    const baseOptions = assign({}, options);
    delete baseOptions.source;

    super(baseOptions);

    /**
     * @private
     * @type {?import("../events.js").EventsKey}
     */
    this.mapPrecomposeKey_ = null;

    /**
     * @private
     * @type {?import("../events.js").EventsKey}
     */
    this.mapRenderKey_ = null;

    /**
     * @private
     * @type {?import("../events.js").EventsKey}
     */
    this.sourceChangeKey_ = null;

    /**
     * @private
     * @type {import("../renderer/Layer.js").default}
     */
    this.renderer_ = null;

    // Overwrite default render method with a custom one
    if (options.render) {
      this.render = options.render;
    }

    if (options.map) {
      this.setMap(options.map);
    }

    listen(this,
      getChangeEventType(LayerProperty.SOURCE),
      this.handleSourcePropertyChange_, this);

    const source = options.source ? /** @type {SourceType} */ (options.source) : null;
    this.setSource(source);
  }

  /**
   * @inheritDoc
   */
  getLayersArray(opt_array) {
    const array = opt_array ? opt_array : [];
    array.push(this);
    return array;
  }

  /**
   * @inheritDoc
   */
  getLayerStatesArray(opt_states) {
    const states = opt_states ? opt_states : [];
    states.push(this.getLayerState());
    return states;
  }

  /**
   * Get the layer source.
   * @return {SourceType} The layer source (or `null` if not yet set).
   * @observable
   * @api
   */
  getSource() {
    return /** @type {SourceType} */ (this.get(LayerProperty.SOURCE)) || null;
  }

  /**
    * @inheritDoc
    */
  getSourceState() {
    const source = this.getSource();
    return !source ? SourceState.UNDEFINED : source.getState();
  }

  /**
   * @private
   */
  handleSourceChange_() {
    this.changed();
  }

  /**
   * @private
   */
  handleSourcePropertyChange_() {
    if (this.sourceChangeKey_) {
      unlistenByKey(this.sourceChangeKey_);
      this.sourceChangeKey_ = null;
    }
    const source = this.getSource();
    if (source) {
      this.sourceChangeKey_ = listen(source,
        EventType.CHANGE, this.handleSourceChange_, this);
    }
    this.changed();
  }

  /**
   * In charge to manage the rendering of the layer. One layer type is
   * bounded with one layer renderer.
   * @param {?import("../PluggableMap.js").FrameState} frameState Frame state.
   * @param {HTMLElement} target Target which the renderer may (but need not) use
   * for rendering its content.
   * @return {HTMLElement} The rendered element.
   */
  render(frameState, target) {
    const layerRenderer = this.getRenderer();

    if (layerRenderer.prepareFrame(frameState)) {
      return layerRenderer.renderFrame(frameState, target);
    }
  }

  /**
   * Sets the layer to be rendered on top of other layers on a map. The map will
   * not manage this layer in its layers collection, and the callback in
   * {@link module:ol/Map#forEachLayerAtPixel} will receive `null` as layer. This
   * is useful for temporary layers. To remove an unmanaged layer from the map,
   * use `#setMap(null)`.
   *
   * To add the layer to a map and have it managed by the map, use
   * {@link module:ol/Map#addLayer} instead.
   * @param {import("../PluggableMap.js").default} map Map.
   * @api
   */
  setMap(map) {
    if (this.mapPrecomposeKey_) {
      unlistenByKey(this.mapPrecomposeKey_);
      this.mapPrecomposeKey_ = null;
    }
    if (!map) {
      this.changed();
    }
    if (this.mapRenderKey_) {
      unlistenByKey(this.mapRenderKey_);
      this.mapRenderKey_ = null;
    }
    if (map) {
      this.mapPrecomposeKey_ = listen(map, RenderEventType.PRECOMPOSE, function(evt) {
        const renderEvent = /** @type {import("../render/Event.js").default} */ (evt);
        renderEvent.frameState.layerStatesArray.push(this.getLayerState(false));
      }, this);
      this.mapRenderKey_ = listen(this, EventType.CHANGE, map.render, map);
      this.changed();
    }
  }

  /**
   * Set the layer source.
   * @param {SourceType} source The layer source.
   * @observable
   * @api
   */
  setSource(source) {
    this.set(LayerProperty.SOURCE, source);
  }

  /**
   * Get the renderer for this layer.
   * @return {import("../renderer/Layer.js").default} The layer renderer.
   */
  getRenderer() {
    if (!this.renderer_) {
      this.renderer_ = this.createRenderer();
    }
    return this.renderer_;
  }

  /**
   * @return {boolean} The layer has a renderer.
   */
  hasRenderer() {
    return !!this.renderer_;
  }

  /**
   * Create a renderer for this layer.
   * @return {import("../renderer/Layer.js").default} A layer renderer.
   * @protected
   */
  createRenderer() {
    return null;
  }

}


/**
 * Return `true` if the layer is visible, and if the passed resolution is
 * between the layer's minResolution and maxResolution. The comparison is
 * inclusive for `minResolution` and exclusive for `maxResolution`.
 * @param {State} layerState Layer state.
 * @param {number} resolution Resolution.
 * @return {boolean} The layer is visible at the given resolution.
 */
export function visibleAtResolution(layerState, resolution) {
  return layerState.visible && resolution >= layerState.minResolution &&
      resolution < layerState.maxResolution;
}


export default Layer;
