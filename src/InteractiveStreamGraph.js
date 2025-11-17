import React, { Component } from "react";
import * as d3 from "d3";

class InteractiveStreamGraph extends Component {
  componentDidUpdate() {
    const chartData = this.props.csvData;
    console.log("Rendering chart with data:", chartData);

    // If there is no data yet, clear the svg and stop
    if (!chartData || chartData.length === 0) {
      d3.select(".svg_parent").selectAll("*").remove();
      return;
    }

    // Define the LLM model names to visualize (order matters)
    const llmModels = ["GPT-4", "Gemini", "PaLM-2", "Claude", "LLaMA-3.1"];

    // Fixed colors for each model
    const colors = {
      "GPT-4": "#e41a1c",
      "Gemini": "#377eb8",
      "PaLM-2": "#4daf4a",
      "Claude": "#984ea3",
      "LLaMA-3.1": "#ff7f00",
    };

    // Sort a copy of the data array by Date (just to be safe)
    const data = chartData.slice().sort((a, b) => a.Date - b.Date);

    // Select the SVG and remove anything drawn previously
    const svg = d3.select(".svg_parent");
    svg.selectAll("*").remove();

    // Overall svg size
    const outerWidth = 600;
    const outerHeight = 500;

    // Margins around the main plotting area
    const margin = { top: 40, right: 160, bottom: 40, left: 50 };
    const width = outerWidth - margin.left - margin.right;
    const height = outerHeight - margin.top - margin.bottom;

    svg.attr("width", outerWidth).attr("height", outerHeight);

    // Main group inside margins
    const g = svg
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // ----------------- SCALES AND STACK LAYOUT -----------------

    // x-axis: time (months)
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, d => d.Date))
      .range([0, width]);

    // stack layout to build the streamgraph layers
    const stack = d3
      .stack()
      .keys(llmModels)
      .offset(d3.stackOffsetWiggle)
      .order(d3.stackOrderInsideOut);

    const layers = stack(data);

    // y-axis: based on stacked min/max
    const yMin = d3.min(layers, layer => d3.min(layer, d => d[0]));
    const yMax = d3.max(layers, layer => d3.max(layer, d => d[1]));

    const y = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([height, 0]);

    // area generator for each stream
    const area = d3
      .area()
      .x(d => x(d.data.Date))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveBasis);

    const monthFormatter = d3.timeFormat("%b");

    // ----------------- PREP DATA FOR MINI BAR CHART -----------------

    // For each model we prepare an array of (month, value)
    const seriesByModel = {};
    llmModels.forEach(model => {
      seriesByModel[model] = data.map(d => ({
        date: d.Date,
        label: monthFormatter(d.Date), // Jan, Feb, ...
        value: d[model]
      }));
    });

    // ----------------- TOOLTIP SETUP -----------------

    // Remove old tooltip if exists (important when React re-renders)
    d3.select("body").selectAll(".mini-tooltip").remove();

    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "mini-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "white")
      .style("border", "1px solid #ccc")
      .style("padding", "8px")
      .style("box-shadow", "0 2px 4px rgba(0,0,0,0.3)")
      .style("display", "none");

    const tooltipSvgWidth = 240;
    const tooltipSvgHeight = 160;

    const tooltipSvg = tooltip
      .append("svg")
      .attr("width", tooltipSvgWidth)
      .attr("height", tooltipSvgHeight);

    // Function to draw the mini bar chart for a given model name
    const renderMiniChart = (modelName) => {
      const miniMargin = { top: 20, right: 10, bottom: 40, left: 35 };
      const miniWidth = tooltipSvgWidth - miniMargin.left - miniMargin.right;
      const miniHeight = tooltipSvgHeight - miniMargin.top - miniMargin.bottom;

      tooltipSvg.selectAll("*").remove(); // clear any old bars/axes

      const miniG = tooltipSvg
        .append("g")
        .attr("transform", "translate(" + miniMargin.left + "," + miniMargin.top + ")");

      const modelSeries = seriesByModel[modelName];

      const xMini = d3
        .scaleBand()
        .domain(modelSeries.map(d => d.label))
        .range([0, miniWidth])
        .padding(0.1);

      const yMini = d3
        .scaleLinear()
        .domain([0, d3.max(modelSeries, d => d.value) || 1])
        .nice()
        .range([miniHeight, 0]);

      // x axis
      miniG
        .append("g")
        .attr("transform", "translate(0," + miniHeight + ")")
        .call(d3.axisBottom(xMini));

      // y axis
      miniG.append("g").call(d3.axisLeft(yMini).ticks(4));

      // bars
      miniG
        .selectAll("rect")
        .data(modelSeries)
        .enter()
        .append("rect")
        .attr("x", d => xMini(d.label))
        .attr("y", d => yMini(d.value))
        .attr("width", xMini.bandwidth())
        .attr("height", d => miniHeight - yMini(d.value))
        .attr("fill", colors[modelName]);

      // small title
      miniG
        .append("text")
        .attr("x", miniWidth / 2)
        .attr("y", -8)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(modelName);
    };

    // ----------------- DRAW STREAMGRAPH -----------------

    // Attach model name to each layer so we know which is which
    const layerData = layers.map((layer, i) => ({
      key: llmModels[i],
      values: layer
    }));

    g.selectAll(".layer")
      .data(layerData)
      .enter()
      .append("path")
      .attr("class", "layer")
      .attr("d", d => area(d.values))
      .attr("fill", d => colors[d.key])
      .attr("opacity", 0.9)
      .on("mouseover", (event, d) => {
        tooltip.style("display", "block");
        renderMiniChart(d.key); // update bar chart for this model
        d3.select(event.currentTarget).attr("opacity", 1.0);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", event.pageX + 15 + "px")
          .style("top", (event.pageY - 80) + "px");
      })
      .on("mouseout", (event) => {
        tooltip.style("display", "none");
        d3.select(event.currentTarget).attr("opacity", 0.9);
      });

    // ----------------- MAIN AXES -----------------

    g.append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(
        d3.axisBottom(x)
          .ticks(d3.timeMonth.every(1))
          .tickFormat(monthFormatter)
      );

    g.append("g").call(d3.axisLeft(y).ticks(5));

    // ----------------- LEGEND -----------------

    const legend = svg
      .append("g")
      .attr("class", "legend")
      .attr(
        "transform",
        "translate(" + (margin.left + width + 20) + "," + margin.top + ")"
      );

    llmModels.forEach((model, index) => {
      const legendRow = legend
        .append("g")
        .attr("transform", "translate(0," + (index * 24) + ")");

      legendRow
        .append("rect")
        .attr("width", 16)
        .attr("height", 16)
        .attr("fill", colors[model]);

      legendRow
        .append("text")
        .attr("x", 22)
        .attr("y", 12)
        .style("font-size", "12px")
        .text(model);
    });

  }


  render() {
    return (
      <svg style={{ width: 600, height: 500 }} className="svg_parent">

      </svg>
    );
  }
}

export default InteractiveStreamGraph;
