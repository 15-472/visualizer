
# Visualizer

### How to run:
- This visualizer takes in an `example.log` created from `observe.mjs` and visualizes the performance over all the timesteps and additionally allows the user to focus on specific time frames and get summary statistics for them.
  - There are two line charts at the top - the top is a view of the specified region in the whole timeframe. You can drag the sides of the gray region or slide from one point to another on the bottom graph to create the gray regions to view.
  - After specifying a region of focus, you can hover over the performances displayed on the top graph. Clicking on one will pull up the histogram and summary stats for the specified report. You can shift click multiple reports to display a combined histogram.
- To create an `example.log`, you will need to use `observe.mjs` to convert print statements in the structure `REPORT [name] [time][unit]` to a binary file that `log-viewer.mjs` will parse and display. Note that the units for the time must be one of `s, ms, us, ns`. The visualizer scales everything to be in milliseconds.
  - The command to run is `node observe.mjs <out.log> <command> [args]`
  - For example, in class, we had the `fast-math.cpp` example where we compiled via `node run.mjs`. This would then print out a bunch of "REPORT---" information that the visualizer will then display as line charts and histograms.
    - The command to run would then be `node observe.mjs out.log node run.mjs`, assuming `observe.mjs` is in the `example` folder.
- An example of immediately using this would be to modfiy your `maekfile.js` to run your renderer for a fixed scene without culling, and then run it with culling, and print the performance in each case to compare them.
- On Google Chrome and Firefox, you will need to set up a server to load local files.
  - This can be done with `http-server`
    - Install via `npm install -g http-server`
    - Then run `http-server` in the directory with `log-viewer.html`
    - You will need to make sure `npm_global` (or something similar) is in your `$PATH` to run it.
  - When making changes to local files, you may need to empty cache and hard reload in order to get the updated changes. See [this](https://stackoverflow.com/questions/25723801/file-not-updating-on-localhost) for more information.

### TODO:
These will be added soon in the next few days.
- Display all histograms separately
- Add BEGIN - END and MARK functionality
- Manually set focus view domain
- Highlight line code
- Add units scaling
- Add bin count flexibility


