import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FulfillmentActivityTimeline } from "./FulfillmentActivityTimeline";

afterEach(() => cleanup());

const EVENT = { id: 1, fulfillmentId: "f1", fulfillmentNumber: "FUL-1", orderId: "o1", orderNumber: "ORD-REAL-1", from: "picking", to: "picked", note: null, at: new Date(Date.now() - 3 * 3_600_000).toISOString(), actor: null };

describe("FulfillmentActivityTimeline", () => {
  it("lists the events it is given with their real age, never built-in examples", () => {
    render(<FulfillmentActivityTimeline events={[EVENT]} />);
    expect(screen.getByText("ORD-REAL-1")).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
    expect(screen.queryByText("ORD-10288")).not.toBeInTheDocument();
  });

  it("says so when nothing has happened and when it could not load", () => {
    const { rerender } = render(<FulfillmentActivityTimeline events={[]} />);
    expect(screen.getByText(/No fulfillment activity yet/)).toBeInTheDocument();
    rerender(<FulfillmentActivityTimeline error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });
});
