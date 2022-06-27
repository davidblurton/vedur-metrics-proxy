// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { format } from "path";
import convert from "xml-js";

type MetricType = "gauge" | "counter";

type Metric = {
  name: string;
  value: number;
  help: string;
  type: MetricType;
};

type MetricDef = {
  name: string;
  help: string;
  type: MetricType;
  path: string;
  format: "float" | "int";
};

const metricDefs: MetricDef[] = [
  {
    name: "temperature",
    help: "Temperature (degrees C)",
    type: "gauge",
    path: "observations.station.T._text",
    format: "float",
  },
  {
    name: "wind_speed",
    help: "Wind speed (m/s)",
    type: "gauge",
    path: "observations.station.F._text",
    format: "float",
  },
  {
    name: "wind_speed_max",
    help: "Max wind speed (m/s)",
    type: "gauge",
    path: "observations.station.FX._text",
    format: "float",
  },
  {
    name: "wind_speed_gust",
    help: "Wind speed gust (m/s)",
    type: "gauge",
    path: "observations.station.FG._text",
    format: "float",
  },
];

function valueFromPath(path: string, obj: any) {
  return path.split(".").reduce((p, c) => (p && p[c]) || undefined, obj);
}

function formatLabels(labels: Record<string, string>) {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return ""
  }

  return "{" + entries.map(([key, value]) => `${key}="${value}"`).join(",") + "}"
}

function metricToProm(metric: Metric, labels: Record<string, string>) {
  return `# HELP ${metric.name} ${metric.help}
# TYPE ${metric.name} ${metric.type}
${metric.name}${formatLabels(labels)} ${metric.value}`;
}

function getMetric(def: MetricDef, data: any): Metric | undefined {
  let value = valueFromPath(def.path, data);

  if (value == undefined) {
    return undefined;
  }

  if (def.format == "float") {
    value = parseFloat(value);
  }

  if (def.format == "int") {
    value = parseInt(value);
  }

  const { name, help, type } = def;

  return {
    name,
    help,
    type,
    value,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>
) {
  const { station } = req.query;

  const f = await fetch(
    `https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&ids=${station}`
  );
  const xml = await f.text();

  const data: any = convert.xml2js(xml, { compact: true });
  const valid = data.observations.station._attributes.valid === "1";

  if (!valid) {
    return res.status(500).send(data.observations.station.err._text);
  }

  const station_id = data.observations.station._attributes.id;
  const time = data.observations.station.time._text;
  const timestamp = new Date(time).getTime();

  const metrics = metricDefs
    .map((def) => getMetric(def, data))
    .flatMap((f) => (f ? [f] : []));

  // res.status(200).send({
  //   data,
  //   metrics,
  //   prom: metrics.map(m => metricToProm(m, timestamp)).join("\n\n")
  // });

  const labels = {}

  res
    .status(200)
    .send(metrics.map((m) => metricToProm(m, labels)).join("\n\n"));
}
