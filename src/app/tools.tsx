import { useState } from "react";
import { View } from "react-native";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import {
  compareTires,
  dragEstimate,
  fuelCost,
  num,
  parseTire,
  rpmAtSpeed,
  signedNum,
  speedAtRpm,
  tireDims,
  wheelFitment,
} from "@/domain/calculators";
import { color, space, type } from "@/theme/tokens";

type Tool = "tires" | "wheels" | "gearing" | "drag" | "fuel";
const TOOLS: { id: Tool; label: string }[] = [
  { id: "tires", label: "Tire size" },
  { id: "wheels", label: "Wheel offset" },
  { id: "gearing", label: "Gearing" },
  { id: "drag", label: "Quarter mile" },
  { id: "fuel", label: "Fuel cost" },
];

/** Car calculators. Everything runs on the phone; results are estimates. */
export default function Tools() {
  const [tool, setTool] = useState<Tool>("tires");
  return (
    <Screen>
      <Text variant="caption" muted>
        Quick math for planning mods. Results are estimates; check fitment with your shop before you buy.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }} accessibilityRole="tablist">
        {TOOLS.map((t) => (
          <Chip key={t.id} label={t.label} selected={tool === t.id} onPress={() => setTool(t.id)} />
        ))}
      </View>
      {tool === "tires" ? <Tires /> : null}
      {tool === "wheels" ? <Wheels /> : null}
      {tool === "gearing" ? <Gearing /> : null}
      {tool === "drag" ? <Drag /> : null}
      {tool === "fuel" ? <Fuel /> : null}
    </Screen>
  );
}

/** A result line: label left, big number right; read as one sentence by screen readers. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text style={[type.spec, { fontSize: 22, lineHeight: 26, color: color.accent }]}>{value}</Text>
    </View>
  );
}
const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function Tires() {
  const [stock, setStock] = useState("245/40R18");
  const [next, setNext] = useState("255/35R19");
  const a = parseTire(stock);
  const b = parseTire(next);
  const c = a && b ? compareTires(a, b) : null;
  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Tire size</SectionHeader>
      <TextField
        label="Stock tire"
        value={stock}
        onChangeText={setStock}
        autoCapitalize="characters"
        error={stock && !a ? "Use a size like 245/40R18" : null}
      />
      <TextField
        label="New tire"
        value={next}
        onChangeText={setNext}
        autoCapitalize="characters"
        error={next && !b ? "Use a size like 255/35R19" : null}
      />
      {c ? (
        <>
          <Row label="Diameter" value={`${c.stock.diameterIn}" → ${c.next.diameterIn}"`} />
          <Row label="Difference" value={`${sign(c.diameterChangePct)}%`} />
          <Row label="Width" value={`${c.stock.widthIn}" → ${c.next.widthIn}"`} />
          <Row label="Sidewall" value={`${c.stock.sidewallIn}" → ${c.next.sidewallIn}"`} />
          <Row label="Real speed at an indicated 60 mph" value={`${c.realAtIndicated60} mph`} />
          <Text variant="caption" muted>
            {Math.abs(c.diameterChangePct) > 3
              ? "More than 3% off stock: expect speedometer error and check clearance."
              : "Within 3% of stock: usually fine for speedometer and clearance."}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

function Wheels() {
  const [sw, setSw] = useState("8");
  const [so, setSo] = useState("45");
  const [nw, setNw] = useState("9");
  const [no, setNo] = useState("35");
  const v = [num(sw), signedNum(so), num(nw), signedNum(no)];
  const ok = v.every((x) => x !== null);
  const r = ok ? wheelFitment({ width: v[0]!, offset: v[1]! }, { width: v[2]!, offset: v[3]! }) : null;
  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Wheel offset</SectionHeader>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField label="Stock width (in)" value={sw} onChangeText={setSw} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Stock offset (mm)" value={so} onChangeText={setSo} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField label="New width (in)" value={nw} onChangeText={setNw} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="New offset (mm)" value={no} onChangeText={setNo} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      {r ? (
        <>
          <Row label="Outer lip (poke)" value={`${sign(r.pokeMm)} mm`} />
          <Row label="Inner lip (toward suspension)" value={`${sign(r.innerMm)} mm`} />
          <Text variant="caption" muted>
            Positive poke sits further out toward the fender; positive inner means less room to the strut.
          </Text>
        </>
      ) : (
        <Text variant="caption" muted>
          Fill in all four numbers.
        </Text>
      )}
    </Card>
  );
}

function Gearing() {
  const [gear, setGear] = useState("1.00");
  const [fd, setFd] = useState("4.11");
  const [tire, setTire] = useState("245/40R18");
  const [mph, setMph] = useState("60");
  const [rpm, setRpm] = useState("7000");
  const t = parseTire(tire);
  const g = num(gear);
  const f = num(fd);
  const d = t ? tireDims(t).diameterIn : null;
  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Gearing</SectionHeader>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField label="Gear ratio" value={gear} onChangeText={setGear} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Final drive" value={fd} onChangeText={setFd} keyboardType="decimal-pad" />
        </View>
      </View>
      <TextField
        label="Tire size"
        value={tire}
        onChangeText={setTire}
        autoCapitalize="characters"
        error={tire && !t ? "Use a size like 245/40R18" : null}
      />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField label="Speed (mph)" value={mph} onChangeText={setMph} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Engine speed (rpm)" value={rpm} onChangeText={setRpm} keyboardType="number-pad" />
        </View>
      </View>
      {g && f && d ? (
        <>
          {num(mph) ? (
            <Row
              label={`Engine speed at ${num(mph)} mph`}
              value={`${rpmAtSpeed(num(mph)!, g, f, d).toLocaleString()} rpm`}
            />
          ) : null}
          {num(rpm) ? (
            <Row
              label={`Road speed at ${num(rpm)!.toLocaleString()} rpm`}
              value={`${speedAtRpm(num(rpm)!, g, f, d)} mph`}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function Drag() {
  const [weight, setWeight] = useState("3300");
  const [whp, setWhp] = useState("250");
  const w = num(weight);
  const h = num(whp);
  const r = w && h ? dragEstimate(w, h) : null;
  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Quarter mile and 0-60</SectionHeader>
      <TextField label="Weight with driver (lb)" value={weight} onChangeText={setWeight} keyboardType="number-pad" />
      <TextField
        label="Wheel horsepower"
        value={whp}
        onChangeText={setWhp}
        keyboardType="number-pad"
        hint="Wheel hp, not the brochure number. Roughly 85% of crank hp for most cars."
      />
      {r ? (
        <>
          <Row label="Power to weight" value={`${r.lbPerHp} lb/whp`} />
          <Row label="Quarter-mile time" value={`${r.quarterEt} s`} />
          <Row label="Trap speed" value={`${r.quarterTrapMph} mph`} />
          <Row label="0-60 (rough)" value={`${r.zeroToSixty} s`} />
          <Text variant="caption" muted>
            Formula estimates, not measurements: traction, gearing, weather and the driver change everything. Only at a
            track or drag strip.
          </Text>
        </>
      ) : null}
    </Card>
  );
}

function Fuel() {
  const [miles, setMiles] = useState("250");
  const [mpg, setMpg] = useState("24");
  const [price, setPrice] = useState("4.50");
  const m = num(miles);
  const e = num(mpg);
  const p = num(price);
  const r = m && e && p ? fuelCost(m, e, p) : null;
  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Fuel cost</SectionHeader>
      <TextField label="Trip distance (miles)" value={miles} onChangeText={setMiles} keyboardType="decimal-pad" />
      <TextField label="Fuel economy (mpg)" value={mpg} onChangeText={setMpg} keyboardType="decimal-pad" />
      <TextField label="Price per gallon ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      {r ? (
        <>
          <Row label="Fuel needed" value={`${r.gallons} gal`} />
          <Row label="Cost" value={`$${r.cost.toFixed(2)}`} />
        </>
      ) : null}
    </Card>
  );
}
