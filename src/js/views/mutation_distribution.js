var mutmap = mutmap || {};

(function(Backbone, d3, utils) {
  "use strict";

  mutmap.MutationDistributionView = Backbone.View.extend({

    initialize: function(options) {

      this.d3el = d3.select(this.el);

      this.dim = utils.getDimensions(this.d3el);

      var distProc = new DistributionProcessor(options.vcfText);

      this._counts = distProc.getCounts();

      console.log(this._counts);

      this._maxCount = 0;
      Object.keys(this._counts).forEach(function(key) {
        if (this._counts[key].total > this._maxCount) {
          this._maxCount = this._counts[key].total;
        }
      }, this);
      this._barScale = d3.scaleLinear()
        .domain([0, this._maxCount])
        .range([0, 80]);

      this._graphData = options.graphData;


      this._container = this.d3el.append("div")
          .style("width", this.dim.width+'px')
          .style("height", this.dim.height+'px');

      var svg = this._container.append("svg")
          .style("width", "100%")
          .style("height", "100%");

      var zoom = d3.zoom()
        .on("zoom", zoomed.bind(this));
      svg.call(zoom);

      var g = svg.append("g");

      this._links_container = g.append("g")
          .attr("class", "links-container");

      this._nodes_container = g.append("g")
          .attr("class", "nodes-container");

      this.render();

      function zoomed() {
        g.attr("transform", d3.event.transform);
      }
    },

    render: function() {

      this.dim = utils.getDimensions(this.d3el);

      this._container
          .style("width", this.dim.width+'px')
          .style("height", this.dim.height+'px');
      this._updateLinks();
      this._updateNodes();
    },

    _updateLinks: function() {

      var self = this;

      var links = this._graphData.links;

      var visualLinksUpdate = this._links_container.selectAll(".link")
          .data(links);

      var visualLinksEnter = visualLinksUpdate.enter()
        .append("g")
          .attr("class", "link");

      var visualLinksEnterUpdate = visualLinksEnter.merge(visualLinksUpdate);

      // Stores references to models and views for bar spark charts
      this._barSparkData = {};

      visualLinksEnter.append("path")
          .attr("d", function(d) {

            var points = self._genLinkPoints(d);

            if (d.type == "child" || d.type == "spouse") {
              return "M" + points.source.x + "," + points.source.y +
                "L" + points.target.x + "," + points.target.y;
            }
            else {

              var controlX = utils.halfwayBetween(points.source.x,
                points.target.x);
              // TODO: parameterize the control point Y value by the distance
              // between the nodes, rather than hard coding
              var controlY = points.source.y - 100;
              return "M" + points.source.x + "," + points.source.y
                + "Q" + controlX + "," + controlY + ","
                + points.target.x + "," + points.target.y;
            }
          })
          .attr("stroke", "#ccc")
          .attr("fill", "transparent")
          .attr("stroke-dasharray", function(d) {
            if (d.type == "duplicate") {
              return "5, 5";
            }
          })
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });


      visualLinksEnter.append("text")
        .attr("text-anchor", "middle")
        .attr("dx", function(d) {
          var points = self._genLinkPoints(d);
          return utils.halfwayBetween(points.source.x, points.target.x);
        })
        .attr("dy", function(d) {
          var points = self._genLinkPoints(d);
          return utils.halfwayBetween(points.source.y, points.target.y);
        });

      function linkHasMutation(d) {
        return d.dataLink !== undefined && d.dataLink.data !== undefined &&
          d.dataLink.data.mutation !== undefined;
      }
    },

    _updateNodes: function() {

      var self = this;

      var visualNodesUpdate = this._nodes_container.selectAll(".node")
          .data(this._graphData.nodes);

      var visualNodesEnter = visualNodesUpdate.enter()
        .append("g")
          .attr("class", "node")
          .attr("transform", function(d) {
            var points = self._genNodePoints(d);
            return utils.svgTranslateString(points.x, points.y);
          });

      //var visualNodesEnterUpdate = visualNodesEnter.merge(visualNodesUpdate);

      var counts = this._counts;
      visualNodesEnter.each(function(d) {

        var symbolSize = 500;

        var variantColors = [
          '#1ebff0', '#050708', '#e62725', '#cbcacb', '#a1cf64', '#edc8c5'
        ];

        var variantData = _.chain(counts[d.dataNode.id])
          .map(function(num, key) {
            return { name: key, value: num };
          })
          .filter(function(item) {
            return item.name !== 'total';
          })
          .sortBy(function(item) {
            return item.name;
          })
          .map(function(item, index) {
            item.color = variantColors[index];
            return item;
          })
          .value();

        if (d.type === "person") {
          if (d.dataNode.sex === "male") {
            d3.select(this).append("path")
                .attr("d", d3.symbol().type(d3.symbolSquare).size(symbolSize))
                .attr("fill", d3.schemeCategory20[1]);
          }
          else {

            var circleWidth = 25;
            var circleHeight = 25;
            var ratioCircleEl = d3.select(this).append("svg")
                .attr("x", -(circleWidth/2))
                .attr("y", -(circleHeight/2))
                .attr("width", circleWidth)
                .attr("height", circleHeight)

            var ratioCircleModel = new mutmap.RatioCircleModel({
              ratioDataList: variantData
            });

            new mutmap.RatioCircleView({
              el: ratioCircleEl.node(),
              model: ratioCircleModel
            });
          }
        }

        if (d.type !== "marriage") {

          var barSparkHeight = 40;
          var barSparkEl = d3.select(this).append("svg")
              .attr("width", 40)
              .attr("height", barSparkHeight)
              .attr("x", 15)
              .attr("y", -barSparkHeight)

          var barSparkModel = new mutmap.BarSparkModel({
            barDataList: variantData
          });
          var barSparkView = new mutmap.BarSparkView({
            model: barSparkModel,
            el: barSparkEl.node()
          });

          self._barSparkData[d.id] = {
            model: barSparkModel,
            view: barSparkView
          };
        }
      });

      visualNodesEnter.append("text")
          .attr("x", 0)
          .attr("y", 22)
          .text(function(d) { 
            if (d.type !== "marriage") {
              return d.dataNode.id;
            }
          })
          .attr("text-anchor", "middle")
          .style("pointer-events", "none")
          .style("font", "8px sans-serif");

      // mutation count bar
      var barWidth = 10;
      var scale = this._barScale;
      visualNodesEnter.append("rect")
          .attr("x", -25)
          .attr("y", function(d) {
            if (counts[d.dataNode.id]) {
              return -scale(counts[d.dataNode.id].total);
            }
            else {
              return 0;
            }
          })
          .attr("width", barWidth)
          .attr("height", function(d) {
            if (counts[d.dataNode.id]) {
              return scale(counts[d.dataNode.id].total);
            }
            else {
              return 0;
            }
          })
          .attr("fill", d3.schemeCategory20[4]);

      // Text above mutation count bar
      visualNodesEnter.append("text")
          .attr("x", -25 + barWidth/2)
          .attr("y", function(d) {

            var offset;
            if (counts[d.dataNode.id]) {
              offset = -scale(counts[d.dataNode.id].total);
            }
            else {
              offset = 0;
            }

            return offset - 3;
          })
          .attr("text-anchor", "middle")
          .text(function(d) {
            if (counts[d.dataNode.id]) {
              return counts[d.dataNode.id].total;
            }
            else {
              return 0;
            }
          });


    },

    // Converts x and y (which are ratios between 0 and 1) into relative
    // values based on the view dimensions
    _genNodePoints: function(d) {
      return this._genPoints(d.x, d.y);
    },

    _genLinkPoints: function(d) {
      return {
        source: this._genPoints(d.source.x, d.source.y),
        target: this._genPoints(d.target.x, d.target.y)
      }
    },

    _genPoints(xRatio, yRatio) {
      return {
        x: xRatio * this.dim.width,
        y: yRatio * this.dim.width/3
      };
    },

  });

  
  function createMutationDistributionView(options) {
    return new MutationDistributionView(options);
  }


  function DistributionProcessor(vcfText) {

    this.counts = processData();

    function processData() {
      //var startTime = new Date();

      var count = 0;
      var counts = {};
      var lines = vcfText.split("\n");
      lines.forEach(function(line, index) {
        if (!line.startsWith("#") && line.length > 0) {

          var data = parseDataLine(line);
          var info = parseInfoColumn(data[7]);
          var dnl = parseDNL(info);
          var dnt = parseDNT(info);
          var type = determineMutationType(dnt);
          //console.log(type);

          var id = idFromKey(dnl.value);

          if (type && id.length > 0) {
            if (counts[id] === undefined) {
              counts[id] = {
                total: 0,
                'C->A': 0,
                'C->G': 0,
                'C->T': 0,
                'T->A': 0,
                'T->C': 0,
                'T->G': 0
              }
            }
            counts[id].total++;
            counts[id][type]++;
            count++;



            //if (index % 1000 === 0) {
            //  console.log(dnl);
            //}
          }
        }
      });

      //var endTime = new Date();
      //var elapsed = endTime - startTime;
      //console.log("Parsing time:", elapsed / 1000);

      return counts;
    }

    function parseDataLine(line) {
      var columns = line.split("\t");
      return columns;
    }

    function parseInfoColumn(column) {
      return column.split(';');
    }

    function parseDNL(info) {
      return parsePair(info[6]);
    }

    function parseDNT(info) {
      return parsePair(info[5]);
    }

    function parsePair(pair) {
      var pairArray = pair.split('=');
      return {
        key: pairArray[0],
        value: pairArray[1]
      };
    }

    function idFromKey(key) {
      var idStartIndex = key.indexOf("/") + 1;
      var idStopIndex = key.indexOf("_");
      if (idStopIndex === -1) {
        idStopIndex = key.length;
      }

      return key.slice(idStartIndex, idStopIndex);
    }

    function determineMutationType(dnt) {

      var mutationString = dnt.value;
      var isGermlineMutation = mutationString.length === 8;
      var parentsAreSameGenotype = mutationString[0] === mutationString[3] &&
        mutationString[1] === mutationString[4];

      if (!isGermlineMutation) {
        return;
      }

      if (!parentsAreSameGenotype) {
        return;
      }

      mutationString = mutationString.slice(3);

      var fromIndex;
      var toIndex;

      if (mutationString[0] !== mutationString[3]) {
        fromIndex = 0;
        toIndex = 3;
      }
      else {
        fromIndex = 1;
        toIndex = 4;
      }

      var mutation = {
        from: mutationString[fromIndex],
        to: mutationString[toIndex]
      };

      var map = {
        'CA': 'CA',
        'GT': 'CA',
        'CG': 'CG',
        'GC': 'CG',
        'CT': 'CT',
        'GA': 'CT',
        'TA': 'TA',
        'AT': 'TA',
        'TC': 'TC',
        'AG': 'TC',
        'TG': 'TG',
        'AC': 'TG',
      };

      var pyrimidineMutation = map[mutation.from + mutation.to];

      return pyrimidineMutation[0] + "->" + pyrimidineMutation[1];
    }
  }

  DistributionProcessor.prototype.getCounts = function() {
    return this.counts;
  };

  return {
    createMutationDistributionView: createMutationDistributionView
  };

}(Backbone, d3, utils));
