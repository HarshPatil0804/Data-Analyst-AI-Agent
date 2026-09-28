import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { ChartConfig } from "../lib/llm";
import type { QueryResult } from "../lib/duckdb";
import { formatDisplayValue, roundForDisplay } from "../lib/formatValue";
import { useTheme } from "../contexts/ThemeContext";
import { BigNumberDisplay } from "./BigNumberDisplay";

export type DisplayChartType = "bar" | "line" | "pie" | "scatter" | "kpi" | "table";

interface ChartViewerProps {
  chart?: ChartConfig | null;
  result: QueryResult;
  explanation?: string | null;
  onPinToDashboard?: (pinData: { chart: ChartConfig; result: QueryResult }) => void;
}

const PALETTE_LIGHT = ["#5b5fc7", "#6fae8c", "#e0a458", "#a374b5", "#d97d75", "#5aa9c9"];
const PALETTE_DARK = ["#9296f0", "#8ec6a8", "#e8bc7e", "#c199d1", "#e6a099", "#7cc3dd"];

export function ChartViewer({
  chart,
  result,
  explanation,
  onPinToDashboard,
}: ChartViewerProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = isDark ? PALETTE_DARK : PALETTE_LIGHT;
  const textColor = isDark ? "#ede9f7" : "#2e2b45";
  const mutedTextColor = isDark ? "#a29cc2" : "#6b6785";
  const splitLineColor = isDark ? "#3d3958" : "#e5e1f2";

  const [isPinned, setIsPinned] = useState(false);

  // Determine initial active chart type from LLM chart config or result shape
  const initialType = useMemo<DisplayChartType>(() => {
    if (result.rows.length === 1 && result.columns.length === 1) {
      return "kpi";
    }
    if (chart?.type && chart.type !== "none") {
      return chart.type as DisplayChartType;
    }
    if (result.columns.length >= 2) {
      return "bar";
    }
    return "table";
  }, [chart, result]);

  const [activeType, setActiveType] = useState<DisplayChartType>(initialType);

  // Resolve x-axis and y-axis columns safely from the available dataset columns
  const { xAxisKey, yAxisKey } = useMemo(() => {
    const cols = result.columns;
    if (cols.length === 0) return { xAxisKey: "", yAxisKey: "" };
    if (cols.length === 1) return { xAxisKey: cols[0], yAxisKey: cols[0] };

    let x = chart?.xAxis && cols.includes(chart.xAxis) ? chart.xAxis : "";
    let y = chart?.yAxis && cols.includes(chart.yAxis) ? chart.yAxis : "";

    if (!x) {
      const firstSample = result.rows[0] || {};
      const nonNumeric = cols.find((c) => typeof firstSample[c] !== "number");
      x = nonNumeric || cols[0];
    }

    if (!y) {
      const numeric = cols.find((c) => c !== x && typeof (result.rows[0]?.[c]) === "number");
      y = numeric || cols.find((c) => c !== x) || cols[1] || cols[0];
    }

    return { xAxisKey: x, yAxisKey: y };
  }, [chart, result]);

  // Construct Apache ECharts Options
  const echartsOption = useMemo(() => {
    const title = chart?.title || `${yAxisKey} by ${xAxisKey}`;

    if (activeType === "bar") {
      const xData = result.rows.map((r) => String(r[xAxisKey] ?? ""));
      const yData = result.rows.map((r) => roundForDisplay(Number(r[yAxisKey]) || 0));

      return {
        title: { text: title, textStyle: { color: textColor, fontSize: 14, fontWeight: "600" } },
        tooltip: {
          trigger: "axis",
          backgroundColor: isDark ? "#2a2740" : "#ffffff",
          borderColor: splitLineColor,
          textStyle: { color: textColor },
          formatter: (params: any) => {
            const item = params[0];
            return `<strong>${item.name}</strong><br/>${yAxisKey}: ${formatDisplayValue(item.value)}`;
          },
        },
        grid: { left: "3%", right: "4%", bottom: "10%", containLabel: true },
        xAxis: {
          type: "category",
          data: xData,
          axisLabel: { color: mutedTextColor, rotate: xData.length > 8 ? 30 : 0 },
          axisLine: { lineStyle: { color: splitLineColor } },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: mutedTextColor, formatter: (val: number) => formatDisplayValue(val) },
          splitLine: { lineStyle: { color: splitLineColor, type: "dashed" } },
        },
        series: [
          {
            name: yAxisKey,
            type: "bar",
            data: yData,
            itemStyle: {
              color: colors[0],
              borderRadius: [6, 6, 0, 0],
            },
          },
        ],
      };
    }

    if (activeType === "line") {
      const xData = result.rows.map((r) => String(r[xAxisKey] ?? ""));
      const yData = result.rows.map((r) => roundForDisplay(Number(r[yAxisKey]) || 0));

      return {
        title: { text: title, textStyle: { color: textColor, fontSize: 14, fontWeight: "600" } },
        tooltip: {
          trigger: "axis",
          backgroundColor: isDark ? "#2a2740" : "#ffffff",
          borderColor: splitLineColor,
          textStyle: { color: textColor },
          formatter: (params: any) => {
            const item = params[0];
            return `<strong>${item.name}</strong><br/>${yAxisKey}: ${formatDisplayValue(item.value)}`;
          },
        },
        grid: { left: "3%", right: "4%", bottom: "10%", containLabel: true },
        xAxis: {
          type: "category",
          data: xData,
          axisLabel: { color: mutedTextColor, rotate: xData.length > 8 ? 30 : 0 },
          axisLine: { lineStyle: { color: splitLineColor } },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: mutedTextColor, formatter: (val: number) => formatDisplayValue(val) },
          splitLine: { lineStyle: { color: splitLineColor, type: "dashed" } },
        },
        series: [
          {
            name: yAxisKey,
            type: "line",
            smooth: true,
            data: yData,
            symbolSize: 8,
            lineStyle: { width: 3, color: colors[0] },
            itemStyle: { color: colors[0] },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: colors[0] + "66" },
                  { offset: 1, color: colors[0] + "00" },
                ],
              },
            },
          },
        ],
      };
    }

    if (activeType === "pie") {
      const pieData = result.rows.map((r, i) => ({
        name: String(r[xAxisKey] ?? `Item ${i + 1}`),
        value: roundForDisplay(Number(r[yAxisKey]) || 0),
      }));

      return {
        title: { text: title, textStyle: { color: textColor, fontSize: 14, fontWeight: "600" } },
        tooltip: {
          trigger: "item",
          backgroundColor: isDark ? "#2a2740" : "#ffffff",
          borderColor: splitLineColor,
          textStyle: { color: textColor },
          formatter: (params: any) => `${params.name}: <strong>${formatDisplayValue(params.value)}</strong> (${params.percent}%)`,
        },
        legend: {
          orient: "horizontal",
          bottom: 0,
          textStyle: { color: mutedTextColor },
        },
        color: colors,
        series: [
          {
            name: yAxisKey,
            type: "pie",
            radius: ["40%", "70%"],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 8, borderColor: isDark ? "#1e1b2e" : "#ffffff", borderWidth: 2 },
            label: { show: true, color: textColor, formatter: "{b}: {d}%" },
            data: pieData,
          },
        ],
      };
    }

    if (activeType === "scatter") {
      const scatterData = result.rows.map((r) => [
        roundForDisplay(Number(r[xAxisKey]) || 0),
        roundForDisplay(Number(r[yAxisKey]) || 0),
      ]);

      return {
        title: { text: title, textStyle: { color: textColor, fontSize: 14, fontWeight: "600" } },
        tooltip: {
          trigger: "item",
          backgroundColor: isDark ? "#2a2740" : "#ffffff",
          borderColor: splitLineColor,
          textStyle: { color: textColor },
          formatter: (params: any) => `${xAxisKey}: ${formatDisplayValue(params.value[0])}<br/>${yAxisKey}: ${formatDisplayValue(params.value[1])}`,
        },
        grid: { left: "3%", right: "4%", bottom: "10%", containLabel: true },
        xAxis: {
          type: "value",
          name: xAxisKey,
          axisLabel: { color: mutedTextColor },
          splitLine: { lineStyle: { color: splitLineColor, type: "dashed" } },
        },
        yAxis: {
          type: "value",
          name: yAxisKey,
          axisLabel: { color: mutedTextColor },
          splitLine: { lineStyle: { color: splitLineColor, type: "dashed" } },
        },
        series: [
          {
            type: "scatter",
            symbolSize: 12,
            itemStyle: { color: colors[0] },
            data: scatterData,
          },
        ],
      };
    }

    return null;
  }, [activeType, chart, result, xAxisKey, yAxisKey, isDark, colors, textColor, mutedTextColor, splitLineColor]);

  function handlePin() {
    setIsPinned(true);
    if (onPinToDashboard) {
      onPinToDashboard({
        chart: chart || { type: activeType, title: `${yAxisKey} by ${xAxisKey}`, xAxis: xAxisKey, yAxis: yAxisKey },
        result,
      });
    }
    setTimeout(() => setIsPinned(false), 2500);
  }

  const chartTypes: { id: DisplayChartType; label: string }[] = [
    { id: "bar", label: "Bar" },
    { id: "line", label: "Line" },
    { id: "pie", label: "Pie" },
    { id: "scatter", label: "Scatter" },
    { id: "kpi", label: "KPI" },
  ];

  return (
    <div className="clay p-5 mb-4 flex flex-col gap-4">
      {/* Top Header & Chart Switcher Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--color-surface-muted)]">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">
            {chart?.title || `${yAxisKey} Visual Insight`}
          </h3>
          {explanation && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{explanation}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Chart Type Selector Pills */}
          <div className="flex items-center p-1 rounded-xl bg-[var(--color-surface-muted)]">
            {chartTypes.map((ct) => (
              <button
                key={ct.id}
                onClick={() => setActiveType(ct.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  activeType === ct.id
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* Pin to Dashboard Button */}
          <button
            onClick={handlePin}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl clay clay-pressable transition-all ${
              isPinned
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            }`}
            title="Pin this chart configuration to Dashboard"
          >
            <span>📌</span>
            <span>{isPinned ? "Pinned!" : "Pin to Dashboard"}</span>
          </button>
        </div>
      </div>

      {/* Main Chart Body */}
      {activeType === "kpi" ? (
        <div className="py-4">
          <BigNumberDisplay result={result} />
        </div>
      ) : echartsOption ? (
        <div className="w-full h-[320px]">
          <ReactECharts
            option={echartsOption}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
          />
        </div>
      ) : null}
    </div>
  );
}
