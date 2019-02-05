const CommonSelectors = require("../lib/common_selectors");
const doubleClickZoom = require("../lib/double_click_zoom");
const Constants = require("../constants");
// const isEventAtCoordinates = require("../lib/is_event_at_coordinates");
const createVertex = require("../lib/create_vertex");

const DrawCircle = {};

DrawCircle.onSetup = function() {
  const circlePolygon = this.newFeature({
    type: Constants.geojsonTypes.FEATURE,
    properties: {},
    geometry: {
      type: Constants.geojsonTypes.POLYGON,
      coordinates: [[]]
    }
  });

  this.addFeature(circlePolygon);

  this.clearSelectedFeatures();
  doubleClickZoom.disable(this);
  this.updateUIClasses({ mouse: Constants.cursors.ADD });
  this.activateUIButton(Constants.types.CIRCLE);
  this.setActionableState({
    trash: true
  });

  return {
    circlePolygon,
    currentVertexPosition: 0
  };
};

DrawCircle.clickAnywhere = function(state, e) {
  // if (
  //   state.currentVertexPosition > 0 &&
  //   isEventAtCoordinates(
  //     e,
  //     state.circlePolygon.coordinates[0][state.currentVertexPosition - 1]
  //   )
  // ) {
  //   return this.changeMode(Constants.modes.SIMPLE_SELECT, {
  //     featureIds: [state.circlePolygon.id]
  //   });
  // }
  this.updateUIClasses({ mouse: Constants.cursors.ADD });
  state.circlePolygon.updateCoordinate(
    `0.${state.currentVertexPosition}`,
    e.lngLat.lng,
    e.lngLat.lat
  );
  state.currentVertexPosition++;
  if (state.currentVertexPosition === 2) {
    return this.changeMode(Constants.modes.SIMPLE_SELECT, {
      featureIds: [state.circlePolygon.id]
    });
  }
  // state.circlePolygon.updateCoordinate(
  //   `0.${state.currentVertexPosition}`,
  //   e.lngLat.lng,
  //   e.lngLat.lat
  // );
};

// DrawCircle.clickOnVertex = function(state) {
//   return this.changeMode(Constants.modes.SIMPLE_SELECT, {
//     featureIds: [state.circlePolygon.id]
//   });
// };

DrawCircle.onMouseMove = function(state, e) {
  state.circlePolygon.updateCoordinate(
    `0.${state.currentVertexPosition}`,
    e.lngLat.lng,
    e.lngLat.lat
  );
  if (CommonSelectors.isVertex(e)) {
    this.updateUIClasses({ mouse: Constants.cursors.POINTER });
  }
};

DrawCircle.onTap = DrawCircle.onClick = function(state, e) {
  // if (CommonSelectors.isVertex(e)) return this.clickOnVertex(state, e);
  return this.clickAnywhere(state, e);
};

DrawCircle.onKeyUp = function(state, e) {
  if (CommonSelectors.isEscapeKey(e)) {
    this.deleteFeature([state.circlePolygon.id], { silent: true });
    this.changeMode(Constants.modes.SIMPLE_SELECT);
  } else if (CommonSelectors.isEnterKey(e)) {
    this.changeMode(Constants.modes.SIMPLE_SELECT, {
      featureIds: [state.circlePolygon.id]
    });
  }
};

DrawCircle.degreesToRadians = function(degrees) {
  return (degrees * Math.PI) / 180;
};

DrawCircle.distanceInKmBetweenEarthCoordinates = function(coords) {
  let lat1 = coords[0][1];
  const lon1 = coords[0][0];
  let lat2 = coords[1][1];
  const lon2 = coords[1][0];
  const earthRadiusKm = 6371;

  const dLat = this.degreesToRadians(lat2 - lat1);
  const dLon = this.degreesToRadians(lon2 - lon1);

  lat1 = this.degreesToRadians(lat1);
  lat2 = this.degreesToRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

DrawCircle.createGeoJSONCircle = function(state) {
  const points = 64;
  const circleCoords = state.circlePolygon.coordinates[0];

  const coords = {
    latitude: circleCoords[0][1],
    longitude: circleCoords[0][0]
  };

  const km = this.distanceInKmBetweenEarthCoordinates(circleCoords);

  const ret = [];
  const distanceX =
    km / (111.32 * Math.cos(this.degreesToRadians(coords.latitude)));
  const distanceY = km / 110.574;

  let theta, x, y;
  for (let i = 0; i < points; i++) {
    theta = (i / points) * (2 * Math.PI);
    x = distanceX * Math.cos(theta);
    y = distanceY * Math.sin(theta);

    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  state.circlePolygon.setCoordinates([ret]);
};

DrawCircle.onStop = function(state) {
  this.updateUIClasses({ mouse: Constants.cursors.NONE });
  doubleClickZoom.enable(this);
  this.activateUIButton();

  // check to see if we've deleted this feature
  if (this.getFeature(state.circlePolygon.id) === undefined) return;

  if (state.circlePolygon.coordinates[0].length === 2) {
    this.createGeoJSONCircle(state);
    this.map.fire(Constants.events.CREATE, {
      features: [state.circlePolygon.toGeoJSON()]
    });
  } else {
    this.deleteFeature([state.circlePolygon.id], { silent: true });
    this.changeMode(Constants.modes.SIMPLE_SELECT, {}, { silent: true });
  }
};

DrawCircle.toDisplayFeatures = function(state, geojson, display) {
  const isActivePolygon = geojson.properties.id === state.circlePolygon.id;
  geojson.properties.active = isActivePolygon ?
    Constants.activeStates.ACTIVE :
    Constants.activeStates.INACTIVE;
  if (!isActivePolygon) return display(geojson);

  // Don't render a polygon until it has two positions
  if (geojson.geometry.coordinates.length === 0) return;

  const coordinateCount = geojson.geometry.coordinates[0].length;
  // 2 coordinates after selecting a draw type
  if (coordinateCount < 2) {
    return;
  }
  geojson.properties.meta = Constants.meta.FEATURE;
  display(
    createVertex(
      state.circlePolygon.id,
      geojson.geometry.coordinates[0][0],
      "0.0",
      false
    )
  );
  // render the Polygon
  return display(geojson);
};

DrawCircle.onTrash = function(state) {
  this.deleteFeature([state.circlePolygon.id], { silent: true });
  this.changeMode(Constants.modes.SIMPLE_SELECT);
};

module.exports = DrawCircle;
