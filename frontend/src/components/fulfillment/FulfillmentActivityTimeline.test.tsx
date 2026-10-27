import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FulfillmentActivityTimeline } from "./FulfillmentActivityTimeline";

afterEach(() => cleanup());

describe("FulfillmentActivityTimeline", () => {
  it("lists the events it is given instead of its built-in examples", () => {
    render(<FulfillmentActivityTimeline events={[{ time: "Just now", orderNumber: "ORD-REAL-1", action: "packed and ready", color: "green" }]} />);
    expect(screen.getByText("ORD-REAL-1")).toBeInTheDocument();
    expect(screen.queryByText("ORD-10288")).not.toBeInTheDocument();
  });
});
