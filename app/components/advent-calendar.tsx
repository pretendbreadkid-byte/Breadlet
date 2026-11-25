"use client";

import { useState } from "react";
import { Gift, Snowflake } from "lucide-react";

// Christmas advent calendar (Settings > Beta). LOOKS ONLY: opening a door just flips it open on
// this screen. Nothing is saved and nothing is given (no API calls at all).

type Prize = { kind: "breadlet"; name: string } | { kind: "bucks"; amount: number };

// What's behind each door, December 1-25. Breadlets from the Winter Bag, plus Bread Bucks.
const DOORS: Prize[] = [
  { kind: "bucks", amount: 50 },
  { kind: "breadlet", name: "Snowball" },
  { kind: "breadlet", name: "Mitten" },
  { kind: "bucks", amount: 75 },
  { kind: "breadlet", name: "Winter Hat" },
  { kind: "breadlet", name: "Christmas Candy" },
  { kind: "bucks", amount: 100 },
  { kind: "breadlet", name: "Santa Hat" },
  { kind: "breadlet", name: "Ornament" },
  { kind: "bucks", amount: 125 },
  { kind: "breadlet", name: "Chimney" },
  { kind: "breadlet", name: "Sugar Cookie" },
  { kind: "bucks", amount: 150 },
  { kind: "breadlet", name: "Gingerbread Cookie" },
  { kind: "breadlet", name: "Stocking" },
  { kind: "bucks", amount: 200 },
  { kind: "breadlet", name: "Chocolate Candy Cookie" },
  { kind: "breadlet", name: "Macadamia Nut Cookie" },
  { kind: "bucks", amount: 250 },
  { kind: "breadlet", name: "Present" },
  { kind: "breadlet", name: "Fireplace" },
  { kind: "bucks", amount: 300 },
  { kind: "breadlet", name: "Igloo" },
  { kind: "breadlet", name: "Festive Breadlet" },
  { kind: "breadlet", name: "Minti's Holiday Edition" },
];

// Door order on the board, mixed up like a real advent calendar.
const LAYOUT = [7, 18, 2, 23, 12, 9, 15, 4, 21, 1, 13, 25, 6, 19, 10, 3, 16, 22, 8, 14, 20, 5, 17, 11, 24];

export function AdventCalendar({ artFor }: { artFor: (name: string) => string }) {
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [peek, setPeek] = useState<number | null>(null);

  const open = (day: number) => {
    setOpened((current) => new Set(current).add(day));
    setPeek(day);
  };

  const prize = peek ? DOORS[peek - 1] : null;

  return (
    <div className="advent">
      <div className="advent-snow" aria-hidden="true">{Array.from({ length: 30 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index * 0.73) % 9}s`, animationDuration: `${7 + (index % 5)}s` }} />)}</div>
      <header className="advent-head">
        <Snowflake size={34} aria-hidden="true" />
        <div>
          <h1>Advent Calendar</h1>
          <p>A new door every day from December 1 to 25.</p>
        </div>
        <span className="advent-beta">Sneak peek</span>
      </header>
      <p className="advent-note">This is a preview. Opening doors here doesn&apos;t give you anything and isn&apos;t saved.</p>

      <div className="advent-board">
        {LAYOUT.map((day) => {
          const isOpen = opened.has(day);
          const behind = DOORS[day - 1];
          return (
            <button key={day} type="button" onClick={() => open(day)} className={`advent-door${isOpen ? " is-open" : ""}${day === 25 ? " is-big" : ""}`} aria-label={`December ${day}${isOpen ? " (opened)" : ""}`}>
              <span className="advent-inside" aria-hidden="true">
                {behind.kind === "breadlet" ? <img src={artFor(behind.name)} alt="" /> : <img src="/assets/Bread%20bucks.svg" alt="" />}
              </span>
              <span className="advent-flap"><b>{day}</b>{day === 25 && <Gift size={22} aria-hidden="true" />}</span>
            </button>
          );
        })}
      </div>

      {prize && peek && (
        <div className="advent-pop" role="dialog" aria-label={`December ${peek}`} onClick={() => setPeek(null)}>
          <div className="advent-pop-card" onClick={(event) => event.stopPropagation()}>
            <small>December {peek}</small>
            {prize.kind === "breadlet" ? <img src={artFor(prize.name)} alt="" /> : <img src="/assets/Bread%20bucks.svg" alt="" />}
            <b>{prize.kind === "breadlet" ? prize.name : `${prize.amount} Bread Bucks`}</b>
            <p>Preview only. Nothing was added to your account.</p>
            <button type="button" onClick={() => setPeek(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
