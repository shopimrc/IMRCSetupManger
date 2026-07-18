// src/dashboard/logic/useSponsorBanner.js
import { useEffect, useMemo, useState } from 'react';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SPONSOR_URL = 'https://raw.githubusercontent.com/shopimrc/IMRCSetupManger/refs/heads/main/sponsor.json';

const DEFAULT_SPONSOR = {
  active: true,
  name: 'Available Banner',
  nameColor: '#FFFFFF',
  logo: null,
  url: 'https://www.shopimrc.com',
};

export function useSponsorBanner() {
  const [sponsor, setSponsor] = useState(DEFAULT_SPONSOR);

  useEffect(() => {
    let alive = true;
    async function loadSponsor() {
      try {
        const res = await fetch(SPONSOR_URL);
        const json = await res.json();
        const todayKey = DAY_KEYS[new Date().getDay()];
        const todayDate = new Date().toISOString().slice(0, 10);
        const match = json?.sponsors?.find((s) => {
          const days = Array.isArray(s?.days) ? s.days : [];
          return s?.active === true && days.includes(todayKey) && todayDate >= String(s?.startDate || '0000-00-00') && todayDate <= String(s?.endDate || '9999-99-99');
        });
        if (alive) setSponsor(match || DEFAULT_SPONSOR);
      } catch {
        if (alive) setSponsor(DEFAULT_SPONSOR);
      }
    }
    loadSponsor();
    return () => { alive = false; };
  }, []);

  const normalizedSponsor = useMemo(() => ({
    ...DEFAULT_SPONSOR,
    ...(sponsor || {}),
    image: sponsor?.logo || sponsor?.image || null,
    label: 'Sponsored By',
  }), [sponsor]);

  return { sponsor: normalizedSponsor };
}
