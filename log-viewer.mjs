// PARAMETERS THAT CAN BE CHANGED:
// global colors for graphs
// if colorList is exhausted, it will repeat colors in an indeterminate order of the line charts vs the histograms
var colorList = ["red", "green", "blue", "yellow", 
				  "black", "cyan", "gray", "orange", 
				  "purple", "pink", "goldenrod", "brown", 
				  "coral", "chocolate"];
var colors;
// precision for histogram stats to be displayed
var detail = 3;
// number of bins for histogram
var binCount = 20;
// file to laod
var file = 'example.log'


// names of histograms to display
var selected = new Set();
var lastSelected = "";
// https://github.com/d3/d3-zoom/issues/222
var brushzoom;

class Event {
	// store everything as ms
	constructor() {
		this.name = ""; // name of the event
		this.timestamp = []; // x-axis
		this.times = []; // y-axis
		this.units = ""; // units for this event
	}
}

//resizable graph w/ marks and such:
class Graph {
	constructor(container) {
		this.container = container;
	}
	reset(chunks, measurements, output) {
		// chunks should be in order of timestamps
		var minTimeStamp = chunks[0].timestamp;
		var maxTimeStamp = chunks[chunks.length - 1].timestamp;
		const decoder = new TextDecoder("utf-8", {ignoreBOM:true, fatal:false});

		// chunk will be in the following format:
		//  [src][timestamp][data]
		// We will need to check the first word in data for REPORT, BEGIN, END
		//  REPORT will have a name and then a timing value (sorted by timestamp)
		//  BEGIN will have a name
		//  END will have a name and then a timing value

		// For now, focus on REPORT
		this.graphs = {};
		var maxTime = 0;
		for(const chunk of chunks) {
			let messageArray = decoder.decode(chunk.bytes).split(" ");
			if(messageArray.length == 0) {
				continue;
			}
			if(messageArray[0] == "REPORT") {
				// if(name == "")
				let name = messageArray[1];
				let time = messageArray[2];
				let units = "";
				let scale = 1;
				// parse time - assume units are s, ms, us, ns
				if(time.search("ms") != -1) {
					units = "ms";
				}
				else if(time.search("us") != -1) {
					units = "us";
					scale = 1000;
				}
				else if(time.search("ns") != -1) {
					units = "ns";
					scale = 1000000;
				}
				else if(time.search("s") != -1) {
					units = "s";
					scale = 0.001;
				} else {
					// No valid time
					continue;
				}
				time = (+time.substring(0, time.search(units))) * scale;
				maxTime = Math.max(maxTime, time);
				if(name in this.graphs) {
					this.graphs[name].timestamp.push(chunk.timestamp);
					this.graphs[name].times.push(time);
				} else {
					let graph = new Event();
					graph.name = name;
					graph.units = units;
					graph.timestamp = [chunk.timestamp];
					graph.times = [time];
					this.graphs[name] = graph;
				}
			}
		}
		// data to visualize
		var data = [];
		// scale everything to same units
		for(const name in this.graphs) {
			var timestamps = this.graphs[name].timestamp;
			var times = this.graphs[name].times;
			// https://stackoverflow.com/questions/22015684/zip-arrays-in-javascript
			data.push.apply(data, timestamps.map(function(e, i) {
				return [e, times[i], name];
				}));
		}
		const groups = d3.rollup(data, v => Object.assign(v, {z: v[0][2]}), d => d[2]);

		// reset measurements
		measurements.reset(groups);

		var div = document.createElement("div");
		div.id = "performance-graphs";
		this.container.appendChild(div);
		let width = 1360;
		let height = 300;
		div.style.width = width + "px";
		div.style.height = height + "px";

		// https://observablehq.com/@connor-roche/multi-line-chart-focus-context-w-mouseover-tooltip
		// main source for the following code of the focus + context charts
		// create the svg element
		var svg = d3.select("#performance-graphs")
			.append("svg")
			.attr("width", width)
			.attr("height", height)

		// margins for both charts
		var focusChartMargin = {top: 20, right: 20, bottom: 150, left: 60};
		var contextChartMargin = {top: 160, right: 20, bottom: 100, left: 60};
		// width for both charts
		var chartWidth = width - focusChartMargin.left - focusChartMargin.right;
		// heights for both charts
		var focusChartHeight = height - focusChartMargin.top - focusChartMargin.bottom;
		var contextChartHeight = height - contextChartMargin.top - contextChartMargin.bottom;

		// create overall container for the charts
		svg.append("svg")
			.attr("width", width + focusChartMargin.left + focusChartMargin.right)
			.attr("height", height + focusChartMargin.top + focusChartMargin.bottom)
			.append("g")
			.attr("style", "overflow: visible; font: 10px sans-serif;") // TODO: consider different font size
			.attr("transform", "translate(" + focusChartMargin.left + "," + focusChartMargin.top + ")");
		
		// x axes domain and ranges
		var xFocus = d3.scaleLinear()
			.domain([minTimeStamp, maxTimeStamp])
			.range([0, chartWidth]);
		var xContext = d3.scaleLinear()
			.domain([minTimeStamp, maxTimeStamp])
			.range([0, chartWidth]);
		// y axes domain and ranges
		var yFocus = d3.scaleLinear()
			.domain([0, d3.max(data, (d) => d[1]) * 1.1])
			.range([focusChartHeight, 0]);
		var yContext = d3.scaleLinear()
			.domain([0, d3.max(data, (d) => d[1])])
			.range([contextChartHeight, 0]);
		// add x axes to charts
		var xAxisFocus = d3.axisBottom(xFocus)
			.tickFormat(d => d + " ms");
		var xAxisContext = d3.axisBottom(xContext);
		// add y axis to focus chart
		var yAxisFocus = d3.axisLeft(yFocus)
			.ticks(5)
			.tickFormat(d => d + " ms");

		// build brush
		var brush = d3.brushX()
			.extent([[0, -10], [chartWidth, contextChartHeight]])
			.on("brush", brushed);
		// build zoom
		// filter specifices zoom can be done by pinching on trackpad while mouse is on focus chart
		//  and double clicking while mouse is on focus chart
		var zoom = d3.zoom()
			.scaleExtent([1, Infinity])
			.translateExtent([[0, 0], [chartWidth, focusChartHeight]])
			.extent([[0, 0], [chartWidth, focusChartHeight]])
			.on("zoom", zoomed)
			.filter((event) => event.type === "dbclick" || event.type === "mousedown");

		// prepare a helper function to draw the line after applying scaling
		var lineFocus = d3.line()
			.x(d => xFocus(d[0]))
			.y(d => yFocus(d[1]));
		var lineContext = d3.line()
			.x(d => xContext(d[0]))
			.y(d => yContext(d[1]));

		// Add a clipPath: everything outside of this area won't be drawn.
		var clip = svg.append("defs")
			.append("svg:clipPath")
			.attr("id", "clip")
			.append("svg:rect")
			.attr("width", chartWidth )
			.attr("height", focusChartHeight )
			.attr("x", 0)
			.attr("y", 0);

		// append clip to the svg
		var focusChartLines = svg.append('g')
			.attr("class", "focus")
			.attr("transform", "translate(" + focusChartMargin.left + "," + focusChartMargin.top + ")")
			.attr("clip-path", "url(#clip)")
		
		// create focus chart
		var focus = svg.append("g")
			.attr("class", "focus")
			.attr("transform", "translate(" + focusChartMargin.left + "," + focusChartMargin.top + ")");
		// create context chart
		var context = svg.append("g")
			.attr("class", "context")
			.attr("transform", "translate(" + contextChartMargin.left + "," + (contextChartMargin.top + 50) + ")"); // TODO: 50?
		
		// add axis to focus chart
		focus.append("g")
			.attr("class", "x-axis")
			.attr("transform", "translate(0," + focusChartHeight + ")")
			.call(xAxisFocus);
		focus.append("g")
			.attr("class", "y-axis")
			.call(yAxisFocus);

		var tooltip = focus.append("g")
			.attr("class", "tooltip-wrapper")
			.attr("display", "none");
		tooltip.append("text")
			.attr("text-anchor", "middle")
			.attr("y", -8);		

		// add axis to context chart
		context.append("g")
			.attr("class", "x-axis")
			.attr("transform", "translate(0," + contextChartHeight + ")")
			.call(xAxisContext);

		// assign random colors to each line among RGB
		colors = d3.scaleOrdinal()
			.domain(data.map(d => d[2]))
			.range(colorList);
		
		// add data to the charts
		for(const [key, value] of groups) {
			focusChartLines.append("path")
				.datum(value)
				.attr("class", "line")
				.attr("fill", "none")
				.attr("stroke", d => colors(d[2]))
				.attr("stroke-width", 1.5)
				.attr("d", lineFocus);
			context.append("path")
				.datum(value)
				.attr("class", "line")
				.attr("fill", "none")
				.attr("stroke", d => colors(d[2]))
				.attr("stroke-width", 1.5)
				.attr("d", lineContext);
		}

		// Add brush to context
		var contextBrush = context.append("g")
			.attr("class", "brush")
			.call(brush);

		// set initial brush selection
		contextBrush.call(brush.move, [0, chartWidth / 2]); 

		// overlay zoom area rectangle on focus chart
		var rectOverlay = svg.append("rect")
			.attr("cursor", "move")
			.attr("fill", "none")
			.attr("pointer-events", "all")
			.attr("class", "zoom")
			.attr("width", chartWidth)
			.attr("height", focusChartHeight)
			.attr("transform", "translate(" + focusChartMargin.left + "," + focusChartMargin.top + ")")
			.call(zoom)
			.on("mousemove", focusMouseMove)
			.on("mouseover", focusMouseOver)
			.on("mouseout", focusMouseOut);

		// focus chart labels
		focus.append("text")
			.attr("transform", "translate(" + (chartWidth / 2) + " ," + (focusChartHeight + focusChartMargin.top + 15) + ")") // TODO: 25?
			.style("text-anchor", "middle")
			.style("font-size", "15px")
			.text("Timestamps");

		focus.append("text")
			.attr("transform", "translate(" + (-focusChartMargin.left + 15) + " ," + (focusChartHeight / 2) + ")rotate(-90)") // TODO: 25?
			.style("text-anchor", "middle")
			.style("font-size", "15px")
			.text("Time");

		function brushed(event) {
			if(brushzoom) return; // ignore brush-by-zoom
			brushzoom = 1;
			tooltip.attr("display", "none");
			var s = event.selection || xContext.range();
			xFocus.domain(s.map(xContext.invert, xContext));
			var filteredData = data.filter(d => d[0] >= xFocus.domain()[0] && d[0] <= xFocus.domain()[1]);

			// update measurements
			const filteredGroups = d3.rollup(filteredData, v => Object.assign(v, {z: v[0][2]}), d => d[2]);
			measurements.update(filteredGroups);

			yFocus.domain([0, d3.max(filteredData, (d) => d[1]) * 1.1]);
			focusChartLines.selectAll(".line")
				.attr("d", lineFocus);
			focus.select(".x-axis")
				.call(xAxisFocus);
			focus.select(".y-axis")
				.call(yAxisFocus);
			svg.select(".zoom")
				.call(zoom.transform, d3.zoomIdentity.scale(chartWidth / (s[1] - s[0])).translate(-s[0], 0));
			contextBrush.attr("display", null)
			brushzoom = 0;
		}

		function zoomed(event) {
			if(brushzoom) return; // ignore zoom-by-brush
			brushzoom = 1;
			tooltip.attr("display", "none");
			var t = event.transform;
			xFocus.domain(t.rescaleX(xContext).domain());
			focusChartLines.selectAll(".line")
				.attr("d", lineFocus);
			focus.select(".x-axis")
				.call(xAxisFocus);
			var brushSelection = xFocus.range().map(t.invertX, t);
			context.select(".brush")
				.call(brush.move, brushSelection);
			contextBrush.attr("display", null)
			measurements.displayAll();
			brushzoom = 0;
		}
		function focusMouseMove(event) {
			tooltip.attr("display", null);
			// get closest data point
			const [xm, ym] = d3.pointer(event);
			const i = d3.leastIndex(data, ([x, y]) => Math.hypot(xFocus(x) - xm, yFocus(y) - ym));
			const [x, y, k] = data[i];
			// on click, display histogram stats
			svg.on("click", function(event) { 
				if(event.shiftKey) {
					selected.add(k);
				} else {
					selected.clear();
					selected.add(k);
				}
				lastSelected = k;
				measurements.displayAll();
				// give timestamp and name
				output.highlight(x);
			});

			tooltip.attr("transform", `translate(${xFocus(x)},${yFocus(y)})`);
			tooltip.select("text").text(k + ": " + y + " ms");
		}
		function focusMouseOver() {
			tooltip.attr("display", "none");
		}
		function focusMouseOut() {
			tooltip.attr("display", "none");
		}
		return this.graphs;
	}
}

//histograms w/ reaction to graph selection:
class Measurements {
	constructor(container) {
		this.container = container;
		this.container.style.overflow = "scroll";
		this.container.style.height = "450px";
		this.container.style.width = "480px";
		this.container.style.position = "absolute";
		this.container.style.top = "300px";

	}
	reset(data) {
		// display the selected histogram
		this.data = data;

		// div for all histograms
		this.div = document.createElement("div");
		this.div.id = "all-histograms";
		this.container.appendChild(this.div);
		let width = 450;
		let height = 450;
		this.div.style.width = width + "px";
		this.div.style.height = height + "px";
		this.div.style.overflow = "scroll";

		// margins for histograms
		this.margin = {top: 20, right: 20, bottom: 200, left: 60};
		// width for histograms
		this.chartWidth = width - this.margin.left - this.margin.right;
		// heights for histograms
		this.chartHeight = height - this.margin.top - this.margin.bottom;
	}
	update(data) {
		this.data = data;
		this.displayAll();
	}
	stats(name, statsDisplay) {
		statsDisplay.innerHTML = "";

		function addSpan(text) {
			var span = document.createElement("span");
			span.innerHTML = text;
			span.style.fontSize = "18px";
			statsDisplay.appendChild(span);
		}
		addSpan("Name: " + name + "<br>");
		// stats:
		// count in time span
		addSpan("Count: " + this.data.get(name).length + "<br>");
		// min
		var min = d3.min(this.data.get(name), (d) => d[1]);
		addSpan("Min: " + min.toFixed(detail) + " ms<br>");
		// median
		var median = d3.median(this.data.get(name), (d) => d[1]);
		addSpan("Median: " + median.toFixed(detail) + " ms<br>");
		// mean
		var mean = d3.mean(this.data.get(name), (d) => d[1]);
		addSpan("Mean: " + mean.toFixed(detail) + " ms<br>");
		// max
		var max = d3.max(this.data.get(name), (d) => d[1]);
		addSpan("Max: " + max.toFixed(detail) + " ms<br>");
		// variance
		if(this.data.get(name).length == 1) {
			addSpan("Variance: 0 ms<br>");
		} else {
			var variance = d3.variance(this.data.get(name), (d) => d[1]);
			addSpan("Variance: " + variance.toFixed(detail) + " ms<br>");
		}
	}
	displayOne(key) {
		// selected contains keys to look into this.data
		// fill data with keys of selected
		// if data is empty, display nothing
		var keys = [...this.data.keys()];
		if(!(keys.includes(key))) {
			return;
		} 
		var data = this.data.get(key);
		
		// container for one histogram
		var div = document.createElement("div");
		div.id = key;
		this.div.appendChild(div);
		let width = 450;
		let height = 480;
		div.style.width = width + "px";
		div.style.height = height + "px";
		div.style.overflow = "scroll";
		height = 280

		// create the svg element
		var svg = d3.select(div)
			.append("svg")
			.attr("width", width)
			.attr("height", height)
			.attr("style", "overflow: scroll; font: 10px sans-serif;") // TODO: consider different font size
		// create histogram
		svg = svg.append("svg")
			.attr("width", width + this.margin.left + this.margin.right)
			.attr("height", height + this.margin.top + this.margin.bottom)
			.append("g")
			.attr("style", "overflow: scroll; font: 10px sans-serif;") // TODO: consider different font size
			.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

		var statsDisplay = document.createElement("section")
		statsDisplay.id = "stats-" + key;
		statsDisplay.style.width = div.style.width;
		statsDisplay.style.height = "160px";
		statsDisplay.style.overflow = "scroll";
		div.appendChild(statsDisplay);

		// if data is not empty, display the histogram
		// display stats of first key
		this.stats(key, statsDisplay);

		const groups = d3.rollup(data, v => Object.assign(v, {z: v[0][2]}), d => d[2]);

		// x axes domain and ranges - this should be times
		var x = d3.scaleLinear()
			.domain([d3.min(data, (d) => d[1]) * 0.9, d3.max(data, (d) => d[1]) * 1.1])
			.range([0, this.chartWidth]);
		// add x axes to charts
		var xAxis = d3.axisBottom(x);
		svg.append("g")
			.attr("transform", "translate(0," + this.chartHeight + ")")
			.call(xAxis);

		var histogram = d3.histogram()
			.value(function(d) { return d[1]; })
			.domain(x.domain())
			.thresholds(x.ticks(binCount)); // TODO: add button for bin count
		
		var bins = [];
		for(const [key, value] of groups) {
			bins.push(histogram(value));
		}

		// y axes domain and ranges - this should be counts
		// bins[0] guaranteed to exist
		var y = d3.scaleLinear()
			.domain([0, d3.max(bins, (d) => d3.max(d, (d) => d.length)) * 1.1])
			.range([this.chartHeight, 0]);
		var yAxis = d3.axisLeft(y);
		svg.append("g")
			.attr("transform", "translate(0,0)")
			.call(yAxis);

		var chartHeight = this.chartHeight;
		for(const bin of bins) {
			svg.selectAll("bar")
				.data(bin)
				.join("rect")
				.attr("class", "bar")
				.attr("x", 1)
				.attr("transform", function(d) { return "translate(" + x(d.x0) + "," + y(d.length) + ")"; })
				.attr("width", function(d) { return Math.abs(x(d.x1) - x(d.x0) - 1); })
				.attr("height", function(d) { return chartHeight - y(d.length); })
				.style("fill", function(d) {
					if(d.length == 0) {
						return "white";
					} else {
						return colors(d[0][2]) ;
				}})
				.style("opacity", 0.5);
		}
	}
	displayAll() {
		// source code for inspiration: https://d3-graph-gallery.com/graph/histogram_double.html
		// clear previous contents
		this.div.innerHTML = "";

		// iterate over selected
		for(const key of selected) {
			this.displayOne(key);
		}
		var scroll = document.getElementById(lastSelected);
		if(scroll !== null) {
			scroll.scrollIntoView();
		}
	}
}

//log with timestamps and some ANSI support:
class Output {
	constructor(container) {
		this.container = container;
	}
	reset(chunks) {
		//clear contents:
		this.container.innerHTML = "";

		//make chunks into <span>text</span><span>text</span>...
		// - split spans on timestamp changes
		// - decode text as utf8 (chars that span timestamps get earlier ts?)
		// - respect ANSI control sequences (at least some of 'em)

		const decoder = new TextDecoder("utf-8", {ignoreBOM:true, fatal:false});

		const container = this.container;

		//manipulated by ANSI escapes:
		let fg = 37; //white
		let bg = 40; //black

		function message(text, tsBegin, tsEnd, cls) {
			let html = "";
			for (let c of text) {
				if (c === "&") html += "&amp;";
				else if (c === "<") html += "&lt;";
				else if (c === ">") html += "&gt;";
				else html += c;
			}
			let span = document.createElement("span");
			if (typeof cls !== "undefined") span.classList.add(cls);
			span.classList.add(`fg${fg}`);
			span.classList.add(`bg${bg}`);
			span.tsBegin = tsBegin; //non-standard property wooooaaahhhh
			span.tsEnd = tsEnd;
			span.innerHTML = html;
			container.appendChild(span);
		}

		const utf8_decoder = {
			message:null,
			multibyte:null,
			tsBegin:null,
			tsEnd:null,
			emit_message:function() {
				if (this.message === null) return;
				message(decoder.decode(new Uint8Array(this.message)), this.tsBegin, this.tsEnd);
				this.message = null;
			},
			emit_broken:function(broken) {
				//as suggested by this stackoverflow answer:
				//  https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex
				let hex = broken.map(x => x.toString(16).padStart(2,'0')).join('');
				message(hex, this.tsBegin, this.tsEnd, "broken");
			},
			timestamp:function(ts){
				if (ts === this.tsBegin) return; //same timestamp, nothing to do.

				//timestamp changed, time to decode the message so far:
				if (this.message !== null) this.emit_message();

				//if not in the middle of a multibyte sequence, adjust tsBegin:
				if (this.multibyte === null) this.tsBegin = ts;
				//always adjust tsEnd:
				this.tsEnd = ts;
			},
			parse:function(byte){
				console.assert(this.tsBegin === this.tsEnd || (this.message === null && this.multibyte !== null), "Should never have pending message when spanning a timestamp range.");

				//special handling if in a multibyte codepoint:
				if (this.multibyte !== null) {
					if ((byte & 0xc0) === 0x80) { //valid continuation byte
						this.multibyte.push(byte);
						if (this.multibyte.length === this.multibyte.expected) {
							//got a full sequence; great, shove into message:
							if (this.message === null) this.message = [];
							this.message.push(...this.multibyte);
							this.multibyte = null;
							//if spanning a timestamp, emit immediately:
							if (this.tsBegin !== this.tsEnd) {
								this.emit_message();
								this.tsBegin = this.tsEnd;
							}
						}
						return; //byte handled so return
					} else { //broken UTF-8
						if (this.message !== null) this.emit_message(); //flush any message before broken part
						this.emit_broken(this.multibyte); //dump multibyte so far
						this.multibyte = null;
						this.tsBegin = this.tsEnd;
						//NOTE: byte was *not* handled as part of multibyte, so fall through to below
					}
				}

				console.assert(this.tsBegin === this.tsEnd, "in non-multibyte operation, should never be spanning multiple timestamps");

				//not in a multibyte codepoint:
				if ((byte & 0x80) === 0x00) { //0xxxxxxx == one-byte codepoint
					if (this.message === null) this.message = [];
					this.message.push(byte);
				} else if ((byte & 0xe0) === 0xc0) { //110xxxxx == two-byte codepoint
					this.multibyte = [byte];
					this.multibyte.expected = 2;
				} else if ((byte & 0xf0) === 0xe0) { //1110xxxx == three-byte codepoint
					this.multibyte = [byte];
					this.multibyte.expected = 3;
				} else if ((byte & 0xf8) === 0xf0) { //11110xxx == four-byte codepoint
					this.multibyte = [byte];
					this.multibyte.expected = 4;
				} else { //broken utf8
					if (this.message !== null) this.emit_message(); //flush any message before broken part
					this.emit_broken([byte]); //emit the broken part
				}
			},
			flush:function(){
				if (this.message !== null) this.emit_message();
				if (this.multibyte !== null) {
					this.emit_broken(this.multibyte);
					this.multibyte = null;
				}
			}
		};

		const ansi_decoder = {
			step:0, //0 => ESC, 1 => [, 2 => [0x30-0x3F]*, 3 => [0x20-0x2f]*, 4 => [0x40-0x7E]
			seq:[],
			tsBegin:null,
			tsEnd:null,
			timestamp:function(ts){
				if (this.seq.length === 0) this.tsBegin = ts;
				this.tsEnd = ts;

				utf8_decoder.timestamp(ts);
			},
			abort:function() {
				for (const byte of this.seq) {
					utf8_decoder.parse(byte);
				}
				this.seq = [];
				this.step = 0;
			},
			interpret:function() {
				const command = String.fromCodePoint(...this.seq.slice(2));
				if (!/^\d*(;\d*)*m$/.test(command)) {
					this.abort();
					return;
				}
				//if there is any message pending on the utf8_decoder, spit it out:
				if (utf8_decoder.message !== null) utf8_decoder.emit_message();

				const params = command.substr(0,command.length-1).split(';').map(parseInt);
				for (let i = 0; i < params.length; ++i) {
					const p = params[i];
					if (p === NaN || p === 0) {
						//reset:
						fg = 37; bg = 40;
					} else if (30 <= p && p <= 37) {
						fg = p;
					} else if (90 <= p && p <= 97) {
						fg = p;
					} else if (40 <= p && p <= 47) {
						bg = p;
					} else if (100 <= p && p <= 107) {
						bg = p;
					} else {
						//unrecognized, but I guess we'll accept it
					}
				}
				this.seq = [];
				this.step = 0;
			},
			parse:function(byte) {
				switch (this.step) {
					case 0:
						if (byte === 0x1b) {
							this.seq.push(byte);
							this.step = 1;
						} else {
							utf8_decoder.parse(byte);
						}
						break;
					case 1:
						if (byte === 0x5b) { // "["
							this.seq.push(byte);
							this.step = 2;
						} else {
							this.abort();
							utf8_decoder.parse(byte);
						}
						break;
					case 2:
						if (0x30 <= byte && byte <= 0x3f) {
							this.seq.push(byte);
							break;
						} else {
							this.step = 3;
							//fall through
						}
					case 3:
						if (0x20 <= byte && byte <= 0x2f) {
							this.seq.push(byte);
							break;
						} else {
							this.step = 4;
							//fall through
						}
					case 4:
						if (0x40 <= byte && byte <= 0x7e) {
							this.seq.push(byte);
							this.interpret();
							break;
						} else {
							this.abort();
							utf8_decoder.parse(byte);
						}
				}
			},
			flush:function() {
				utf8_decoder.flush();
			}
		};


		for (const chunk of chunks) {
			ansi_decoder.timestamp(chunk.timestamp);
			for (const byte of chunk.bytes) {
				ansi_decoder.parse(byte);
			}
		}
		ansi_decoder.flush();
	}
	highlight(timestamp) {
		for(const child of this.container.children) {
			if(child.tsBegin <= timestamp) {
				// child.classList should be length 2, with the FG and the BG
				child.classList.remove('fg90');
				if(child.classList.length == 1) {
					// the original FG is fg90, so add it back
					child.classList.add('fg90');
				}
				if(child.tsBegin == timestamp) {
					child.scrollIntoView();
				}
			} else {
				// child.classList should be length 3, with the old FG, the BG and with FG90
				child.classList.add('fg90');
			}
		}
	}
}

class LogViewer {
	constructor(doc) {
		this.GRAPH = new Graph(document.getElementById("graph"));
		this.MEASUREMENTS = new Measurements(document.getElementById("measurements"));
		this.OUTPUT = new Output(document.getElementById("output"));

		this.events = [];
	}
	load(buffer) { //load from an ArrayBuffer
		this.events = [];
		this.chunks = [];

		const view = new DataView(buffer);

		let offset = 0;
		while (offset < view.byteLength) {
			// chunks are: [src][timestamp][count][data]
			if (offset + 10 > view.byteLength) break;
			const source = view.getUint8(offset); offset += 1;
			const timestamp = view.getFloat64(offset, true); offset += 8;
			const count = view.getUint8(offset); offset += 1;
			if (offset + count > view.byteLength) break;
			const bytes = new Uint8Array(buffer, offset, count); offset += count;
			this.chunks.push({ source, timestamp, count, bytes });
			// console.log(source, timestamp, count, bytes);
		}
		if (offset != view.byteLength) {
			console.warn(`Incomplete last chunk (${view.byteLength - offset} bytes).`);
		}

		console.log(`Found ${this.chunks.length} chunks.`);

		this.OUTPUT.reset(this.chunks);
		this.GRAPH.reset(this.chunks, this.MEASUREMENTS, this.OUTPUT);
	}
}

const VIEWER = window.VIEWER = new LogViewer(document);

async function init() {
	console.log("Loading from example.log...");
	const response = await fetch(file);
	const body = await response.arrayBuffer();
	console.log(` done (${body.byteLength} bytes).`);
	VIEWER.load(body);
}

init();
