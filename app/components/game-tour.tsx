"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Backpack, CircleUserRound, Gift, Hammer, Hand, MessageCircle, Package, ShoppingBag, Store, Trophy, Users, X } from "lucide-react";

export type TourTab = "profile" | "wheel" | "capsules" | "inventory" | "crafting" | "clan" | "market" | "chat" | "leaderboard" | "event";

const steps: { title: string; description: string; tab: TourTab; target?: TourTab; icon: typeof Hand }[] = [
  { title: "Welcome to Breadlet!", description: "Take a quick tour of your profile, Goodybags, collection, and the rest of Breadlet. You can skip at any time.", tab: "profile", icon: Hand },
  { title: "Your Profile", description: "Click the Breadlet logo to open your profile. View your tokens, owned Breadlets, badges, and activity. Find players here to send friend and trade requests.", tab: "profile", target: "profile", icon: CircleUserRound },
  { title: "Daily Crate", description: "Open your free Daily Crate to win tokens or crafting materials. Signed-in players receive one opening per UTC day.", tab: "wheel", target: "wheel", icon: Package },
  { title: "Goodybags", description: "Open Goodybags with tokens to collect Breadlets. The info button shows a bag's rewards and odds. Mass Open lets you open several at once. Legacy bags return from 17:00 to 18:00 UTC.", tab: "capsules", target: "capsules", icon: Store },
  { title: "Your Collection", description: "Browse your Breadlets and select an owned item to see details, equip it, or sell extra copies. Mass Sell keeps one copy of every selected Breadlet.", tab: "inventory", target: "inventory", icon: Backpack },
  { title: "Crafting", description: "Dismantle Breadlets into material bundles, then use the listed recipes to craft special Breadlets. Dismantling never awards Gold or Gem.", tab: "crafting", target: "crafting", icon: Hammer },
  { title: "Clans", description: "Find a clan to join or create your own. Donate tokens to its treasury and work together. You can leave a clan from its panel.", tab: "clan", target: "clan", icon: Users },
  { title: "Bazaar", description: "Browse player listings, buy Breadlets, or offer an owned Breadlet for sale. A listed item is reserved until it sells, so it cannot be spent twice.", tab: "market", target: "market", icon: ShoppingBag },
  { title: "Global Chat", description: "Talk to other players, reply to messages, and click a username to view their profile. The online-player control shows who is currently around.", tab: "chat", target: "chat", icon: MessageCircle },
  { title: "Ranks", description: "Compare token balances and clan treasuries on the leaderboards. Clan images and equipped Breadlets appear alongside the rankings.", tab: "leaderboard", target: "leaderboard", icon: Trophy },
  { title: "Contest of Spooky", description: "During the event, earn Candy by opening bags, claiming your Daily Crate, and completing trades. Check your Candy place here: the top 20 earn Skeleton Pirate, and the top 3 also earn Festive Skeleton Pirate.", tab: "event", target: "event", icon: Gift },
];

export function GameTour({ onSelect, onClose }: { onSelect: (tab: TourTab) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef(onSelect);
  const closeRef = useRef(onClose);
  selectRef.current = onSelect;
  closeRef.current = onClose;
  const step = steps[index];
  const Icon = step.icon;

  useEffect(() => {
    selectRef.current(step.tab);
    nextRef.current?.focus();
  }, [step.tab, index]);

  useEffect(() => {
    const element = step.target ? document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`) : null;
    if (!element) {
      setSpotlight(null);
      return;
    }
    element.scrollIntoView({ block: "nearest", inline: "center" });
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left - 3);
      const top = Math.max(0, rect.top - 3);
      setSpotlight({ left, top, width: Math.max(0, Math.min(window.innerWidth, rect.right + 3) - left), height: Math.max(0, Math.min(window.innerHeight, rect.bottom + 3) - top) });
    };
    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousTourClass = document.body.classList.contains("game-tour-active");
    document.body.style.overflow = "hidden";
    document.body.classList.add("game-tour-active");
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!previousTourClass) document.body.classList.remove("game-tour-active");
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>("[data-tour-target='profile']")?.focus();
    };
  }, []);

  return createPortal(
    <div className="game-tour" data-tour-step={index + 1}>
      {!spotlight && <div className="game-tour-backdrop" />}
      {spotlight && <div className="game-tour-spotlight" style={spotlight} aria-hidden="true" />}
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="game-tour-title" aria-describedby="game-tour-description" className="game-tour-dialog">
        <div className="game-tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase">Step {index + 1} of {steps.length}</p><button onClick={onClose} aria-label="Close tour" title="Close tour" className="game-tour-close"><X size={20} /></button></div>
        <div className="mt-4 flex items-center gap-3"><span className="game-tour-icon"><Icon size={24} /></span><h2 id="game-tour-title">{step.title}</h2></div>
        <p id="game-tour-description" className="mt-4 text-sm leading-6">{step.description}</p>
        <div className="game-tour-dots mt-6" aria-hidden="true">{steps.map((entry, position) => <span key={entry.title} className={position === index ? "current" : ""} />)}</div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button onClick={onClose} className="game-tour-skip">Skip tour</button><div className="flex gap-2">{index > 0 && <button onClick={() => setIndex((current) => current - 1)} className="game-tour-back"><ArrowLeft size={16} />Back</button>}<button ref={nextRef} onClick={() => index === steps.length - 1 ? onClose() : setIndex((current) => current + 1)} className="game-tour-next">{index === steps.length - 1 ? "Finish" : "Next"}<ArrowRight size={16} /></button></div></div>
      </section>
    </div>, document.body,
  );
}