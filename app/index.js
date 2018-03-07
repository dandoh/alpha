require('svg.draggable.js');
require('svg.panzoom.js');
import SVG from 'svg.js';
import Mousetrap from 'mousetrap';
import inPolygon from 'point-in-polygon';
import convexHull from 'convex-hull';
import FileSaver from 'file-saver';

const NODE_CIRCLE_RADIUS = 2;


let draw;
let currentStep = 0;

function getRandomColor() {
  function rainbow(numOfSteps, step) {
    // This function generates vibrant, "evenly spaced" colours (i.e. no clustering). This is ideal for creating easily distinguishable vibrant markers in Google Maps and other apps.
    // Adam Cole, 2011-Sept-14
    // HSV to RBG adapted from: http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
    var r, g, b;
    var h = step / numOfSteps;
    var i = ~~(h * 6);
    var f = h * 6 - i;
    var q = 1 - f;
    switch(i % 6){
      case 0: r = 1; g = f; b = 0; break;
      case 1: r = q; g = 1; b = 0; break;
      case 2: r = 0; g = 1; b = f; break;
      case 3: r = 0; g = q; b = 1; break;
      case 4: r = f; g = 0; b = 1; break;
      case 5: r = 1; g = 0; b = q; break;
    }
    var c = "#" + ("00" + (~ ~(r * 255)).toString(16)).slice(-2) + ("00" + (~ ~(g * 255)).toString(16)).slice(-2) + ("00" + (~ ~(b * 255)).toString(16)).slice(-2);
    return (c);
  }

  return rainbow(5, currentStep++);
}

const rollBall = ({ball, edgeLayer, afterRoll, edgeColor, haloLayer}) => {
  if (!ball) return;
  let currentBall = ball;
  let path = [];
  const roll = () => {
    let {center, node, diameter} = currentBall;
    let candidates = node.neighbors.map((neighbor) => {
      let [center1, center2] = findCenters({
        x1: node.x,
        y1: node.y,
        x2: neighbor.x,
        y2: neighbor.y,
        radius: diameter / 2
      });
      let centerAngle = angle(node, center);
      let center1Angle = angle(node, center1);
      let center2Angle = angle(node, center2);

      if (ccwAngle(centerAngle, center1Angle) > ccwAngle(centerAngle, center2Angle)) {
        [center1, center2] = [center2, center1];
        [center1Angle, center2Angle] = [center2Angle, center1Angle];
      }

      let chosenCenter = center1;
      let diffAngle = ccwAngle(centerAngle, center1Angle);
      if (ccwAngle(centerAngle, center1Angle) == 0) {
        let a1 = angle(center, node);
        let a2 = angle(center, neighbor);
        if (ccwAngle(a2, a1) > 180) {
          chosenCenter = center2;
          diffAngle = ccwAngle(centerAngle, center2Angle);
        }
      }

      return {
        chosenCenter, neighbor, diffAngle
      }
    }).sort((a, b) => a.diffAngle - b.diffAngle);

    if (candidates.length) {
      let {chosenCenter, neighbor, diffAngle} = candidates[0];
      if (path.length) {
        let {from, to} = path[0];
        if (from === node.id && to === neighbor.id) {
          currentBall.circle.remove();
          currentBall.nodeCircle.remove();
          afterRoll(path);
          return;
        }
      }

      currentBall.circle.animate(50 * diffAngle / 60).rotate(diffAngle, node.x, node.y).after(() => {
        currentBall.circle.remove();
        currentBall.nodeCircle.remove();
        let line = edgeLayer
          .line(node.x, node.y, neighbor.x, neighbor.y)
          .stroke({width: 1, color: edgeColor});
        path.push({from: node.id, to: neighbor.id, line, edgeColor});
        currentBall = {
          circle: haloLayer
            .circle(diameter)
            .center(chosenCenter.x, chosenCenter.y)
            .fill('none')
            .stroke({color: '#f06', width: 0.5}),
          center: chosenCenter,
          node: neighbor,
          nodeCircle:
            haloLayer.circle(5 * NODE_CIRCLE_RADIUS)
              .center(neighbor.x, neighbor.y)
              .fill('#24f'),
          diameter
        };
        roll();
      });
    } else {
      afterRoll(path);
    }
  };
  roll();
  return path;
};

const originPosition = ({x, y, svg}) => {
  let pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  let svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
  return {
    x: svgP.x, y: svgP.y
  }
};

const distance = (p1, p2) => {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
};

const ccwAngle = (a, b) => {
  // from a to b
  let r = b - a;
  if (r < 0) return r + 360;
  else return r;
};

const findCenters = ({x1, y1, x2, y2, radius: r}) => {
  let q = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  // midpoint
  let y3 = (y1 + y2) / 2;
  let x3 = (x1 + x2) / 2;

  return [
    {
      x: x3 + Math.sqrt(r ** 2 - (q / 2) ** 2) * (y1 - y2) / q,
      y: y3 + Math.sqrt(r ** 2 - (q / 2) ** 2) * (x2 - x1) / q
    },
    {
      x: x3 - Math.sqrt(r ** 2 - (q / 2) ** 2) * (y1 - y2) / q,
      y: y3 - Math.sqrt(r ** 2 - (q / 2) ** 2) * (x2 - x1) / q
    }
  ]
};

const angle = ({x: x1, y: y1}, {x: x2, y: y2}) => {
  let ag = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  if (ag < 0) {
    ag += 360;
  }

  return ag;
};

const findBallCenter = ({node, ballDiameter}) => {
  let candidates = [];
  let radius = ballDiameter / 2;
  for (let neighbor of node.neighbors) {
    let {x: x1, y: y1} = node;
    let {x: x2, y: y2} = neighbor;

    for (let center of findCenters({x1, y1, x2, y2, radius})) {
      let ok = true;
      for (let otherNeighbor of node.neighbors) {
        if (otherNeighbor === neighbor) continue;
        if (distance(center, otherNeighbor) < radius) {
          ok = false;
        }
      }

      if (ok) {
        candidates.push(center);
      }
    }
  }

  candidates.sort((center1, center2) => angle(node, center1) - angle(node, center2));
  if (candidates.length) {
    return candidates[0];
  } else {
    return null;
  }
};


const generateNodes = ({width, height, GRID_HEIGHT, GRID_WIDTH, V}) => {
  let nodes = [];
  let nextId = 0;
  for (let i = 0; i < GRID_HEIGHT; i++) {
    for (let j = 0; j < GRID_WIDTH; j++) {
      const numNodes = Math.floor(V / GRID_HEIGHT / GRID_WIDTH);
      const hfrom = (height / GRID_HEIGHT) * i;
      const wfrom = (width / GRID_WIDTH) * j;
      for (let k = 0; k < numNodes; k++) {
        const x = Math.random() * (width / GRID_WIDTH) + wfrom;
        const y = Math.random() * (height / GRID_HEIGHT) + hfrom;
        nextId++;
        nodes.push({x, y, id: nextId});
      }
    }
  }
  while (nextId < V) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    nextId++;
    nodes.push({x, y, id: nextId});
  }
  return nodes;
};


const processNeighbors = ({nodes, range}) => {
  let V = nodes.length;
  for (let node of nodes) node.neighbors = [];

  for (let i = 0; i < V; i++) {
    for (let j = i + 1; j < V; j++) {
      if ((nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2 <= range ** 2) {
        nodes[i].neighbors.push(nodes[j]);
        nodes[j].neighbors.push(nodes[i]);
      }
    }
  }

  return nodes;
};

const drawNodes = ({nodes, nodeLayer}) => {
  nodes.forEach(node => {
    node.circle = nodeLayer
      .circle(NODE_CIRCLE_RADIUS * 2)
      .center(node.x, node.y)
      .fill('#111');
  });

  return nodes;
};

function findCenterOnClick({nodes, ballDiameter, onFindCenter}) {
  nodes.forEach(node => {
    node.circle.off('click');
    node.circle.click((e) => {
      let center = findBallCenter({node, ballDiameter});
      if (center) {
        onFindCenter({center, node});
      }
    })
  });

  return nodes;
}

function createIndicatorLayer({draw, width, height}) {
  let layer = draw.group().move(width + 20, 20);
  let currentY = 40;
  layer.addIndicator = ({color, name}) => {
    layer.line(0, currentY, 200, currentY).stroke({width: 0.5, color})
    layer.text(name).font({family: "Menlo"}).move(210, currentY - 8);
    currentY += 20;
  };

  return layer;
}

$('#generate-btn').click(function () {
  const height = parseInt($('#height-input').val());
  const width = parseInt($('#width-input').val());
  const range = parseInt($('#range-input').val());
  const GRID_HEIGHT = parseInt($('#grid-height-input').val());
  const GRID_WIDTH = parseInt($('#grid-width-input').val());
  const V = parseInt($('#v-input').val());
  let nodes = generateNodes({width, height, GRID_WIDTH, GRID_HEIGHT, V});
  init({nodes, width, height, range});
});


let file = null;
$('#file-input').change(function(){
  console.log("day ne");
  if (this.files.length) {
    file = this.files[0];
    let reader = new FileReader();
    if (file) {

      reader.onload = function(event) {
        let {nodes, width, height, range} = JSON.parse(event.target.result);
        init({nodes, width, height, range})
      };

      reader.readAsText(file);
    }
  }
});

$('#generate-file-btn').click(function(){
  $('#file-input').trigger("click");
});


function init({nodes, width, height, range}) {
  if (draw) {
    draw.remove();
    $('#firstroll-btn').off('click');
    $('#secondroll-btn').off('click');
    $('#save-btn').off('click');
  }

  draw = SVG('graph-container').size("100%", "100%").panZoom();
  const svg = draw.node;
  const selectLayer = draw.group();
  const haloLayer = draw.group();
  const edgeLayer = draw.group();
  const nodeLayer = draw.group();
  const indicatorLayer = createIndicatorLayer({draw, width, height});

  let boundNodes = [];
  let boundaries = [];
  let currentBall;

  nodes = drawNodes({nodes, nodeLayer});
  nodes = processNeighbors({nodes, range});
  nodes = findCenterOnClick({
    nodes, ballDiameter: range, onFindCenter: ({node, center}) => {
      if (currentBall) {
        currentBall.nodeCircle.remove();
        currentBall.circle.remove();
      }
      currentBall = {
        circle: haloLayer
          .circle(range)
          .center(center.x, center.y)
          .fill('none')
          .stroke({color: '#f06', width: 0.5}),
        center: center,
        node: node,
        nodeCircle:
          haloLayer.circle(5 * NODE_CIRCLE_RADIUS)
            .center(node.x, node.y)
            .fill('#24f'),
        diameter: range,
      }
    }
  });

  let state = 'normal';
  let isSeleting = false;
  let polylines = [];
  draw.mousedown((e) => {
    if (state === 'deleting') {
      isSeleting = true;
      let {x, y} = originPosition({x: e.clientX, y: e.clientY, svg});
      let polyline = selectLayer.polyline([x, y]).fill('#ffccca').stroke({width: 0.5});
      polylines.push(polyline);
    }
  });

  draw.mousemove((e) => {
    if (state === 'normal') {


    } else if (state === 'deleting') {
      if (isSeleting) {
        let {x, y} = originPosition({x: e.clientX, y: e.clientY, svg});
        let polyline = polylines[polylines.length - 1];
        polyline.plot(polyline.array().value.concat([[x, y]])).fill('#ffccca').stroke({width: 0.5});
      }
    }

  });

  draw.mouseup((e) => {
    if (state === 'deleting') {
      if (isSeleting) {
        isSeleting = false;
        state = 'normal';
        draw.panZoom();

        for (let node of nodes) {
          let {x, y} = node;
          for (let polyline of polylines) {
            if (inPolygon([x, y], polyline.array().value)) {
              node.halo = haloLayer
                .circle(4 * NODE_CIRCLE_RADIUS)
                .center(x, y)
                .fill('#ff6262')
            }
          }
        }
      }
    }
  });

  Mousetrap.bind(['command+d', 'ctrl+d'], () => {
    if (state === 'normal') {
      state = 'deleting';
      draw.panZoom(false)
    }
  });

  Mousetrap.bind(['del', 'backspace'], () => {
    nodes
      .filter(node => node.halo)
      .forEach(node => {
        node.halo.remove();
        node.circle.remove();
      });
    nodes = nodes.filter(node => !node.halo);
    polylines.forEach(p => p.remove());
    processNeighbors({nodes, range});
  });

  Mousetrap.bind(['command+h', 'ctrl+h'], () => {
  });

  Mousetrap.bind('esc', () => {
    state = 'normal';
    nodes
      .filter(node => node.halo)
      .forEach(node => {
        node.halo.remove();
        delete node.halo;
      });
    polylines.forEach(p => p.remove());
  });

  $('#save-btn').click(() => {
    let blob = new Blob([JSON.stringify({width, height, range, nodes: nodes.map(({x, y, id}) => ({x, y, id}))})]);
    FileSaver.saveAs(blob, "network.json");
  });

  $('#second-ball-input').on('input', (val) => {
    prepareSecondRoll();

  });

  const prepareSecondRoll = () => {
    let ballDiameter = parseInt($('#second-ball-input').val());
    boundNodes = processNeighbors({nodes: boundNodes, range: ballDiameter});
    boundNodes = findCenterOnClick({
      nodes: boundNodes, ballDiameter, onFindCenter: ({node, center}) => {
        if (currentBall) {
          currentBall.circle.remove();
          currentBall.nodeCircle.remove();
        }
        currentBall = {
          circle: haloLayer
            .circle(ballDiameter)
            .center(center.x, center.y)
            .fill('none')
            .stroke({color: '#f06', width: 0.5}),
          center,
          node,
          diameter: ballDiameter,
          nodeCircle:
            haloLayer.circle(5 * NODE_CIRCLE_RADIUS)
              .center(node.x, node.y)
              .fill('#24f')
        }
      }
    });

    $('#secondroll-btn').off('click');
    $('#secondroll-btn').click(() => {
      let color = getRandomColor();
      rollBall({
        ball: currentBall, edgeLayer, haloLayer,
        edgeColor: color,
        afterRoll: (path) => {
          let boundary = {name: `Diameter ${currentBall.diameter}`, color, path};
          indicatorLayer.addIndicator({color, name: boundary.name});
        }
      })
    })
  };

  $('#firstroll-btn').click(() => {
    processNeighbors({nodes, range});
    let color = '#d5d5d5';
    rollBall({
      ball: currentBall, edgeLayer, haloLayer,
      edgeColor: color,
      afterRoll: (path) => {
        let boundary = {name: 'Bound (First Roll)', color, path};
        boundaries.push(boundary);
        indicatorLayer.addIndicator({color, name: boundary.name});


        let ids = new Set(path.map(({from, to}) => from));
        let otherNodes = nodes.filter(node => !ids.has(node.id));
        otherNodes.forEach(node => node.circle.fill('#d5d5d5'));
        boundNodes = nodes.filter(node => ids.has(node.id));


        // draw convex hull
        let convexHullColor = getRandomColor();
        let ch = convexHull(boundNodes.map(({x, y}) => [x, y]));
        for (let i = 0; i < ch.length; i++) {
          let {x: x1, y: y1} = boundNodes[ch[i][0]];
          let {x: x2, y: y2} = boundNodes[ch[i][1]];
          edgeLayer
            .line(x1, y1, x2, y2)
            .stroke({width: 1, color: convexHullColor});
        }
        indicatorLayer.addIndicator({name: 'Convex hull', color: convexHullColor});


        prepareSecondRoll();
      }
    });
    $('#firstroll-btn').off('click')
  });
}

