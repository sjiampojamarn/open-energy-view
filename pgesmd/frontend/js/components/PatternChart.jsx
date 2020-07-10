import React from "react";
import { Line } from "react-chartjs-2";
import { groupBy } from "../functions/groupBy";
import { max, sum, min, mean } from "ramda";
import { maxOf } from "../functions/maxOf";
import { minOf } from "../functions/minOf";
import { makeIntervalArray } from "../functions/makeIntervalArray";
import { removeOutliers } from "../functions/removeOutliers";
import { EnergyHistory } from "../data-structures/EnergyHistory";
import { makeChartData } from "../functions/makeChartData";
import { add } from "date-fns";
import { isEqual } from "date-fns/esm";
import { startOfWeekYear } from "date-fns";
import PatternDay from "./PatternDay";
import PatternWeek from "./PatternWeek";
import PatternYear from "./PatternYear";
import PatternParts from "./PatternParts";
import { List, Map, remove } from "immutable";
import { standardDeviationOf } from "../functions/standardDeviationOf";
import { useState } from "react";
import { ToggleButton } from "react-bootstrap";
import { lookupPartitionSums } from "../functions/lookupPartitionSums";
import { indexInDb } from "../functions/indexInDb";
import { editHsl } from "../functions/editHsl";

const PatternChart = ({ energyHistory }) => {
  const [showApplianceSpikes, setShowApplianceSpikes] = useState(true);

  console.log(energyHistory.partitionSums);

  const daysArray = makeIntervalArray(
    new EnergyHistory(energyHistory.response, {
      start: startOfWeekYear(energyHistory.firstDate),
      end: add(startOfWeekYear(energyHistory.lastDate), { weeks: 52 }),
    }),
    "week"
  );

  const arrayOfYears = [];
  let oneYear = [];
  let nextYear = add(daysArray[0][0], { weeks: 52 });
  for (let array of daysArray) {
    if (!isEqual(array[0], nextYear)) {
      oneYear.push(array);
    } else {
      arrayOfYears.push(oneYear);
      oneYear = [];
      oneYear.push(array);
      nextYear = add(array[0], { weeks: 52 });
    }
  }
  arrayOfYears.push(oneYear);

  console.log(arrayOfYears);
  const getIndex = indexInDb(energyHistory.database);
  const output = new Array(52);
  for (let i = 0; i < 52; i++) {
    output[i] = {
      parts: new Array(energyHistory.partitionOptions.value.length).fill(0),
      entries: 0,
      passive: 0,
      total: 0,
    };

    for (let year of arrayOfYears) {
      const week = year[i];
      const startIndex = getIndex(week[0]);
      const endIndex = getIndex(week[1]);
      const entry = lookupPartitionSums(
        energyHistory.partitionSums,
        startIndex,
        endIndex
      );

      let total = 0;
      let passive = 0;
      let entries = 0;
      for (let j = 0; j < entry.length; j++) {
        const part = entry[j];
        if (!part.name) break;
        entries += 1;
        console.log(output[i].parts);
        output[i].parts[j] += part.sumActive;
        total += part.sumTotal;
        passive += part.sumPassive;
      }
      output[i].total += total;
      output[i].passive += passive;
      output[i].entries += entries / entry.length;
    }
  }

  console.log(output);

  const partData = output.map((x) => {
    const partPercentages = x.parts.map((y) => {
      return (y / x.total) * 100;
    });
    const passivePercentage = [(x.passive / x.total) * 100];

    const grouped = passivePercentage.concat(partPercentages);
    // grouped is [passive, part1, part2, part3, etc...]

    return grouped.reduce((acc, x, i) => {
      if (i === 0) return [{ value: x, chart: x }];
      return acc.concat({
        value: x,
        chart: x + acc[i - 1].chart,
      });
    }, []);
  });

  console.log(partData);

  const yearParts = new Array(partData[0].length);
  for (let i = 0; i < yearParts.length; i++) {
    yearParts[i] = {
      label:
        i === 0 ? "Passive" : energyHistory.partitionOptions.value[i - 1].name,
      data: partData.map((x) => x[i].chart),
      backgroundColor: editHsl(
        i === 0 ? "hsla(185, 16%, 83%, 1)" : energyHistory.partitionOptions.value[i - 1].color,
        { l: (l) => (l + 100) / 2 }
      ),
      fill: i === 0 ? true : "-1",
      borderColor:
        i === 0 ? "gray" : energyHistory.partitionOptions.value[i - 1].color,
      pointRadius: 0,
      order: yearParts.length - i + 1
    };
  }

  console.log(yearParts);

  const makeYearsData = makeChartData(energyHistory.database);

  const yearsData = arrayOfYears.map(makeYearsData);

  //TODO: add bogus data to leapyear to make all 365
  console.log(yearsData.map((x) => x.toJS()));

  const yearTotals = new Array(52);
  for (let i = 0; i < 52; i++) {
    let dayEntries = 0;
    let dayTotal = 0;
    let dayPassive = 0;
    let dayActive = 0;
    for (let year of yearsData) {
      if (isNaN(year.get(i).get("total"))) continue;
      dayEntries += 1;
      dayTotal += year.get(i).get("total");
      dayPassive += year.get(i).get("passive");
      dayActive += year.get(i).get("active");
    }
    yearTotals[i] = {
      total: dayTotal / dayEntries,
      passive: dayPassive / dayEntries,
      active: dayActive / dayEntries,
    };
  }

  const dayGroups = groupBy("day")(energyHistory.database);

  const weekGroupsUncut = groupBy("week")(energyHistory.database);
  const weekGroups = weekGroupsUncut.slice(1, weekGroupsUncut.length - 1);

  const yLabelWidth = 50;

  const getMeans = (groups, type, hoursInEachGroup) => {
    const sums = groups.reduce((acc, day) => {
      for (let hour = 0; hour < day.size; hour++) {
        acc[hour] += day.get(hour).get(type);
      }
      return acc;
    }, new Array(hoursInEachGroup).fill(0));
    const means = sums.map((x) => x / groups.length);
    return means;
  };

  const quickRemoveOutliers = (arr) => {
    const _arrMean = mean(arr);
    const _arrStd = standardDeviationOf(arr);

    return arr.map((x) => {
      return x < _arrMean + 2 * _arrStd ? x : _arrMean;
    });
  };

  // TODO: this is a nice metric ... but it should be done on the entire history
  // and be accessible as a prop of the energyHistory instance

  const removeApplianceSpikes = (groups) => {
    return groups.map((x) => {
      const arr = x.map((y) => y.get("total")).toJS();
      return List(quickRemoveOutliers(arr).map((z) => Map({ total: z })));
    });
  };

  const recentDayGroups = dayGroups.slice(
    dayGroups.length - 28,
    dayGroups.length
  );

  const recentWeekGroups = weekGroups.slice(
    weekGroups.length - 4,
    weekGroups.length
  );

  const smoothDayGroups = removeApplianceSpikes(dayGroups);
  const smoothWeekGroups = removeApplianceSpikes(weekGroups);
  const smoothRecentDayGroups = removeApplianceSpikes(recentDayGroups);
  const smoothRecentWeekGroups = removeApplianceSpikes(recentWeekGroups);

  const selectedDayGroups = showApplianceSpikes ? dayGroups : smoothDayGroups;
  const selectedWeekGroups = showApplianceSpikes
    ? weekGroups
    : smoothWeekGroups;
  const selectedRecentDayGroups = showApplianceSpikes
    ? recentDayGroups
    : smoothRecentDayGroups;
  const selectedRecentWeekGroups = showApplianceSpikes
    ? recentWeekGroups
    : smoothRecentWeekGroups;

  const dayTotals = getMeans(selectedDayGroups, "total", 24).slice(0, 24);
  const recentDayTotals = getMeans(selectedRecentDayGroups, "total", 24).slice(
    0,
    24
  );

  const weekTotals = getMeans(selectedWeekGroups, "total", 24 * 7).slice(
    0,
    7 * 24
  );
  const recentWeekTotals = getMeans(
    selectedRecentWeekGroups,
    "total",
    24 * 7
  ).slice(0, 24 * 7);

  const suggestedMax = maxOf(
    getMeans(recentWeekGroups, "total", 24 * 7).slice(0, 7 * 24)
  );
  const suggestedMin = min(minOf(dayTotals), minOf(weekTotals));

  console.log(suggestedMax);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "10px",
        position: "relative",
        margin: "auto",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div className="day-week-pattern">
        <div className="pattern-header">
          <div className="pattern-title">Daily and Weekly</div>
          <div className="pattern-option">
            <input
              className="pattern-option-checkbox"
              type="checkbox"
              onChange={() => setShowApplianceSpikes(!showApplianceSpikes)}
              checked={showApplianceSpikes}
            />
            Show Appliance Usage?
          </div>
        </div>
        <div className="pattern-flex-1">
          <div className="pattern-chartJS-box">
            <PatternDay
              energyHistory={energyHistory}
              dayTotals={dayTotals}
              recentDayTotals={recentDayTotals}
              suggestedMin={suggestedMin}
              suggestedMax={suggestedMax}
              yLabelWidth={yLabelWidth}
            />
          </div>
          <div className="pattern-week-labels-container">
            <div className="pattern-labels-week">
              <div>Night</div>
              <div>Day</div>
              <div>Evening</div>
            </div>
          </div>
        </div>
        <div className="pattern-flex-2">
          <div className="pattern-chartJS-box">
            <PatternWeek
              energyHistory={energyHistory}
              weekTotals={weekTotals}
              recentWeekTotals={recentWeekTotals}
              suggestedMin={suggestedMin}
              suggestedMax={suggestedMax}
              yLabelWidth={yLabelWidth}
            />
          </div>
          <div className="pattern-week-labels-container">
            <div className="pattern-labels-week">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>
          </div>
        </div>
      </div>
      <div className="day-week-pattern">
        <div className="pattern-header">
          <div className="pattern-title">Yearly</div>
        </div>
        <div className="pattern-flex-1">
          <div className="pattern-chartJS-box">
            <PatternYear yearTotals={yearTotals} yLabelWidth={yLabelWidth} />
          </div>
          <div className="pattern-week-labels-container">
            <div className="pattern-labels-week">
              <div>Jan</div>
              <div>Feb</div>
              <div>Mar</div>
              <div>Apr</div>
              <div>May</div>
              <div>Jun</div>
              <div>Jul</div>
              <div>Aug</div>
              <div>Sep</div>
              <div>Oct</div>
              <div>Nov</div>
              <div>Dec</div>
            </div>
          </div>
        </div>
      </div>
      <div className="day-week-pattern">
        <div className="pattern-header">
          <div className="pattern-title">Yearly</div>
        </div>
        <div className="pattern-flex-1">
          <div className="pattern-chartJS-box">
            <PatternParts yearParts={yearParts} yLabelWidth={yLabelWidth} />
          </div>
          <div className="pattern-week-labels-container">
            <div className="pattern-labels-week">
              <div>Jan</div>
              <div>Feb</div>
              <div>Mar</div>
              <div>Apr</div>
              <div>May</div>
              <div>Jun</div>
              <div>Jul</div>
              <div>Aug</div>
              <div>Sep</div>
              <div>Oct</div>
              <div>Nov</div>
              <div>Dec</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default PatternChart;
