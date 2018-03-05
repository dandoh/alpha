require('svg.draggable.js');
require('svg.panzoom.js');
import SVG from 'svg.js';
import Mousetrap from 'mousetrap';
import inPolygon from 'point-in-polygon';

const NODE_CIRCLE_RADIUS = 2;


let draw;

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
  if (r <= 0) return r + 360;
  else return r;
}

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
};

$('#generate-btn').click(function () {


  if (draw) draw.remove();

  draw = SVG('graph-container').size("100%", "100%").panZoom();
  let selectLayer = draw.group();
  let haloLayer = draw.group();
  let edgeLayer = draw.group();
  let nodeLayer = draw.group();


  const svg = draw.node;
  const height = parseInt($('#height-input').val());
  const width = parseInt($('#width-input').val());
  const range = parseInt($('#range-input').val());
  const GRID_HEIGHT = parseInt($('#grid-height-input').val());
  const GRID_WIDTH = parseInt($('#grid-width-input').val());
  const V = parseInt($('#v-input').val());

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


  processNeighbors({nodes, range});
  let currentBall;
  nodes.forEach(node => {
    node.circle = nodeLayer
      .circle(NODE_CIRCLE_RADIUS * 2)
      .center(node.x, node.y)
      .fill('#111');

    node.circle.mousedown((e) => {
      if (currentBall) {
        currentBall.circle.remove();
        currentBall.nodeCircle.remove();
      }
      let candidates = [];
      for (let neighbor of node.neighbors) {
        let {x: x1, y: y1} = node;
        let {x: x2, y: y2} = neighbor;

        for (let center of findCenters({x1, y1, x2, y2, radius: range / 2})) {
          let ok = true;
          for (let otherNeighbor of node.neighbors) {
            if (otherNeighbor === neighbor) continue;
            if (distance(center, otherNeighbor) < range / 2) {
              ok = false;
            }
          }

          if (ok) {
            candidates.push(center);
          }
        }
      }

      candidates.sort((center1, center2) => angle(center1, node) - angle(center2, node));
      if (candidates.length) {
        let center = candidates[0];
        currentBall = {
          circle: haloLayer
            .circle(range)
            .center(center.x, center.y)
            .fill('none')
            .stroke({color: '#f06', width: 0.5}),
          center,
          node,
          nodeCircle:
            haloLayer.circle(5 * NODE_CIRCLE_RADIUS)
              .center(node.x, node.y)
              .fill('#24f')
        }
      } else {
        console.log("Not found");
      }
    })
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
    for (let node of nodes) {
      if (node.halo) {
        node.halo.remove();
        node.circle.remove();
      }
    }
    nodes = nodes.filter(node => !node.halo);
    polylines.forEach(p => p.remove());
    processNeighbors({nodes, range});
  });

  Mousetrap.bind(['command+h', 'ctrl+h'], () => {
  });

  Mousetrap.bind('esc', () => {
    state = 'normal';
  });

  let path = [];
  const roll = () => {
    let {center, node, circle} = currentBall;
    let candidates = node.neighbors.map((neighbor) => {
      let [center1, center2] = findCenters({
        x1: node.x,
        y1: node.y,
        x2: neighbor.x,
        y2: neighbor.y,
        radius: range / 2
      });
      let centerAngle = angle(node, center);
      let center1Angle = angle(node, center1);
      let center2Angle = angle(node, center2);

      let chosenCenter;
      let diffAngle;
      if (ccwAngle(centerAngle, center1Angle) > ccwAngle(centerAngle, center2Angle)) {
        chosenCenter = center2;
        diffAngle = ccwAngle(centerAngle, center2Angle);
      } else {
        chosenCenter = center1;
        diffAngle = ccwAngle(centerAngle, center1Angle);
      }
      if (diffAngle === 0) diffAngle = 9999;

      return {
        chosenCenter, neighbor, diffAngle
      }
    }).sort((a, b) => a.diffAngle - b.diffAngle);

    if (candidates.length) {
      let {chosenCenter, neighbor, diffAngle} = candidates[0];
      if (path.length){
        let {from, to} = path[0];
        if (from === node.id && to === neighbor.id) {
          currentBall.circle.remove();
          currentBall.nodeCircle.remove();
          processFirstRoll();
          return;
        }
      }

      path.push({from: node.id, to: neighbor.id});

      currentBall.circle.animate(500 * diffAngle / 60).rotate(diffAngle, node.x, node.y).after(() => {
        currentBall.circle.remove();
        currentBall.nodeCircle.remove();
        edgeLayer.line(node.x, node.y, neighbor.x, neighbor.y).stroke({width: 0.5, color: '#13f'});
        currentBall = {
          circle: haloLayer
            .circle(range)
            .center(chosenCenter.x, chosenCenter.y)
            .fill('none')
            .stroke({color: '#f06', width: 0.5}),
          center: chosenCenter,
          node: neighbor,
          nodeCircle:
            haloLayer.circle(5 * NODE_CIRCLE_RADIUS)
              .center(neighbor.x, neighbor.y)
              .fill('#24f')
        };
        roll();
      });
    }
  };


  const processFirstRoll = () => {
    $('#firstroll-btn').off('click');
    let ballDiameter = 80;
    let ids = new Set(path.map(({from, to}) => from));
    let boundNodes = nodes.filter(node => ids.has(node.id));
    let otherNodes = nodes.filter(node => !ids.has(node.id));
    otherNodes.forEach(node => node.circle.fill('#d5d5d5'));
    currentBall = null;
    processNeighbors({nodes: boundNodes, range: ballDiameter});
    boundNodes.forEach(node => {
      node.circle.off('mousedown');
      node.circle.mousedown((e) => {
        if (currentBall) {
          currentBall.circle.remove();
          currentBall.nodeCircle.remove();
        }
        let candidates = [];
        for (let neighbor of node.neighbors) {
          let {x: x1, y: y1} = node;
          let {x: x2, y: y2} = neighbor;

          for (let center of findCenters({x1, y1, x2, y2, radius: ballDiameter / 2})) {
            let ok = true;
            for (let otherNeighbor of node.neighbors) {
              if (otherNeighbor === neighbor) continue;
              if (distance(center, otherNeighbor) < ballDiameter / 2) {
                ok = false;
              }
            }

            if (ok) {
              candidates.push(center);
            }
          }
        }

        candidates.sort((center1, center2) => angle(center1, node) - angle(center2, node));
        if (candidates.length) {
          let center = candidates[0];
          currentBall = {
            circle: haloLayer
              .circle(ballDiameter)
              .center(center.x, center.y)
              .fill('none')
              .stroke({color: '#f06', width: 0.5}),
            center,
            node,
            nodeCircle:
              haloLayer.circle(5 * NODE_CIRCLE_RADIUS)
                .center(node.x, node.y)
                .fill('#24f')
          }
        } else {
          console.log("Not found");
        }
      })
    });
  };

  $('#firstroll-btn').off('click');
  $('#firstroll-btn').click(() => {
    path = [];
    processNeighbors({nodes, range});
    roll();
  });


});
