import React, { useMemo, useState } from 'react';
import aidLookup from './aidLookup.json';
import './FinancialAidCalculator.css';

const EMAIL_COOKIE_NAME = 'aid_calc_email';

const getCookie = (name) => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
};

const setCookie = (name, value, days = 365) => {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
};

const EMAIL_CAPTURE_ENDPOINT =
    process.env.REACT_APP_EMAIL_CAPTURE_ENDPOINT ||
    'https://obmx70jcug.execute-api.us-east-1.amazonaws.com/prod/email-capture';

const recordEmailLocally = (email) => {
    if (typeof window === 'undefined') return;
    try {
        const existing = JSON.parse(window.localStorage.getItem('aidCalculatorEmails') || '[]');
        existing.push({ email, recordedAt: new Date().toISOString() });
        window.localStorage.setItem('aidCalculatorEmails', JSON.stringify(existing));
    } catch (error) {
        console.error('Unable to store email locally', error);
    }
};

const sendEmailToServer = async (email) => {
    if (!EMAIL_CAPTURE_ENDPOINT) return;
    try {
        const payload = JSON.stringify({
            email,
            source: 'financial_aid_calculator',
            capturedAt: new Date().toISOString(),
        });

        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            const fired = navigator.sendBeacon(EMAIL_CAPTURE_ENDPOINT, blob);
            if (fired) return;
        }

        await fetch(EMAIL_CAPTURE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload,
            keepalive: true,
        });
    } catch (error) {
        console.error('Unable to record email remotely', error);
    }
};

const createSliderConfig = (key, label, step) => {
    const markers = aidLookup.breakpoints[key];
    return {
        key,
        label,
        markers,
        min: markers[0],
        max: markers[markers.length - 1],
        step,
    };
};

const sliderConfig = [
    createSliderConfig('income', 'Income', 1000),
    createSliderConfig('cash', "Parents' Cash", 1000),
    createSliderConfig('investments', 'Non-Retirement Investments', 2500),
];

const defaultInputs = sliderConfig.reduce((acc, config) => {
    const medianIndex = Math.floor(config.markers.length / 2);
    acc[config.key] = config.markers[medianIndex];
    return acc;
}, {});

const placementSuffix = ['ST', 'ND', 'RD'];

const formatCurrency = (value) =>
    typeof value === 'number'
        ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
        : 'N/A';

const formatMarker = (value) => {
    if (!Number.isFinite(value)) {
        return '';
    }
    if (value >= 1_000_000) {
        const formatted = value % 1_000_000 === 0 ? (value / 1_000_000).toFixed(0) : (value / 1_000_000).toFixed(1);
        return `$${formatted}M`;
    }
    if (value >= 1000) {
        return `$${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}k`;
    }
    return `$${value}`;
};

const getAxisPosition = (value, markers) => {
    if (value <= markers[0]) {
        return { lower: 0, upper: 0, weight: 0 };
    }

    for (let i = 0; i < markers.length - 1; i += 1) {
        const start = markers[i];
        const end = markers[i + 1];
        if (value <= end) {
            const span = end - start;
            const weight = span === 0 ? 0 : (value - start) / span;
            return { lower: i, upper: i + 1, weight };
        }
    }

    const lastIndex = markers.length - 1;
    return { lower: lastIndex, upper: lastIndex, weight: 0 };
};

const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);
const formatNumberInput = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '');
const parseNumberInput = (value) => Number(String(value).replace(/,/g, ''));

const lerp = (a, b, t) => {
    if (a == null && b == null) return null;
    if (a == null) return b;
    if (b == null) return a;
    return a + (b - a) * t;
};

const interpolateAidAmount = (matrix, axes) => {
    if (!matrix) return null;

    const { income, cash, investments } = axes;
    const getValue = (i, c, v) => matrix?.[i]?.[c]?.[v] ?? null;

    const interpolatePlane = (incomeIndex) => {
        const lowerCash = getValue(incomeIndex, cash.lower, investments.lower);
        const lowerCashUpperInv = getValue(incomeIndex, cash.lower, investments.upper);
        const upperCashLowerInv = getValue(incomeIndex, cash.upper, investments.lower);
        const upperCashUpperInv = getValue(incomeIndex, cash.upper, investments.upper);

        const cashLowerBlend = lerp(lowerCash, lowerCashUpperInv, investments.weight);
        const cashUpperBlend = lerp(upperCashLowerInv, upperCashUpperInv, investments.weight);
        return lerp(cashLowerBlend, cashUpperBlend, cash.weight);
    };

    const lowerPlane = interpolatePlane(income.lower);
    if (income.lower === income.upper) {
        return lowerPlane;
    }

    const upperPlane = interpolatePlane(income.upper);
    return lerp(lowerPlane, upperPlane, income.weight);
};

function FinancialAidCalculator() {
    const [inputs, setInputs] = useState(defaultInputs);
    const [inputValues, setInputValues] = useState(() =>
        sliderConfig.reduce((acc, config) => {
            acc[config.key] = formatNumberInput(defaultInputs[config.key]);
            return acc;
        }, {}),
    );
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [emailError, setEmailError] = useState('');
    const [hasUnlockedFullList, setHasUnlockedFullList] = useState(() => Boolean(getCookie(EMAIL_COOKIE_NAME)));

    const handleChange = (key) => (event) => {
        const nextValue = Number(event.target.value);
        setInputs((prev) => ({ ...prev, [key]: nextValue }));
        setInputValues((prev) => ({ ...prev, [key]: formatNumberInput(nextValue) }));
    };

    const handleInputChange = (key) => (event) => {
        const { value } = event.target;
        setInputValues((prev) => ({ ...prev, [key]: value }));
    };

    const handleInputBlur = (config) => () => {
        const rawValue = parseNumberInput(inputValues[config.key]);
        if (Number.isNaN(rawValue)) {
            setInputValues((prev) => ({ ...prev, [config.key]: formatNumberInput(inputs[config.key]) }));
            return;
        }
        const clampedValue = clampValue(rawValue, config.min, config.max);
        setInputs((prev) => ({ ...prev, [config.key]: clampedValue }));
        setInputValues((prev) => ({ ...prev, [config.key]: formatNumberInput(clampedValue) }));
    };

    const handleCtaClick = () => {
        if (hasUnlockedFullList) {
            return;
        }
        setIsModalOpen(true);
    };

    const validateEmail = (value) => /\S+@\S+\.\S+/.test(value);

    const handleEmailSubmit = (event) => {
        event.preventDefault();
        const sanitizedEmail = emailInput.trim();
        if (!validateEmail(sanitizedEmail)) {
            setEmailError('Enter a valid email to continue.');
            return;
        }

        recordEmailLocally(sanitizedEmail);
        sendEmailToServer(sanitizedEmail);
        setCookie(EMAIL_COOKIE_NAME, sanitizedEmail);
        setHasUnlockedFullList(true);
        setIsModalOpen(false);
        setEmailError('');
        setEmailInput('');
    };

    const rankedColleges = useMemo(() => {
        const axisPositions = {
            income: getAxisPosition(inputs.income, aidLookup.breakpoints.income),
            cash: getAxisPosition(inputs.cash, aidLookup.breakpoints.cash),
            investments: getAxisPosition(inputs.investments, aidLookup.breakpoints.investments),
        };
        // Surface the current placement within each axis for quick debugging.
        // eslint-disable-next-line no-console
        console.log('Axis positions', axisPositions);

        return aidLookup.schools
            .map((school) => {
                const matrix = aidLookup.matrices?.[school];
                const aidAmount = interpolateAidAmount(matrix, axisPositions);
                // eslint-disable-next-line no-console
                console.log(`Aid value for ${school}:`, aidAmount);

                if (aidAmount == null) {
                    return null;
                }

                return {
                    name: school,
                    aidAmount,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.aidAmount - a.aidAmount);
    }, [inputs]);

    const isLocked = !hasUnlockedFullList;
    const displayedColleges = hasUnlockedFullList ? rankedColleges : rankedColleges.slice(0, 4);

    return (
        <div className="calculator-page">
            <div className="calculator-shell">
                <aside className="options-panel">
                    <h2 className="options-title">Options</h2>
                    {sliderConfig.map((config) => (
                        <div className="option-card" key={config.key}>
                            <div className="option-label-text">{config.label}</div>
                            <div className="option-input-row">
                                <span className="currency-prefix">$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    min={config.min}
                                    max={config.max}
                                    step={config.step}
                                    value={inputValues[config.key]}
                                    onChange={handleInputChange(config.key)}
                                    onBlur={handleInputBlur(config)}
                                    className="option-number-input"
                                />
                            </div>
                            <div className="slider-stack">
                                <div className="slider-track">
                                    <input
                                        type="range"
                                        min={config.min}
                                        max={config.max}
                                        step={config.step}
                                        value={inputs[config.key]}
                                        onChange={handleChange(config.key)}
                                        className="option-slider"
                                    />
                                    <div className="slider-markers">
                                        {config.markers.map((marker) => {
                                            const ratio =
                                                (marker - config.min) / (config.max - config.min || 1);
                                            const position = Math.min(Math.max(ratio * 100, 0), 100);
                                            const boundedPosition = Math.min(Math.max(position, 5), 95);
                                            return (
                                                <span
                                                    key={marker}
                                                    className="slider-marker"
                                                    style={{ left: `${boundedPosition}%` }}
                                                >
                                                    {formatMarker(marker)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </aside>

                <section className="leaderboard-panel">
                    <h1 className="leaderboard-title">College Financial Aid Calculator</h1>

                    <div className={`leaderboard-stack ${hasUnlockedFullList ? 'leaderboard-stack-open' : ''}`}>
                        {displayedColleges.map((college, index) => {
                            const placementRank = index + 1;
                            const placementClass = placementRank <= 3 ? `placement-${placementRank}` : 'placement-4';
                            const shadowClass = isLocked && index === 3 ? 'placement-shadow' : '';

                            return (
                                <div
                                    key={college.name}
                                    className={`leaderboard-card ${placementClass} ${shadowClass}`}
                                >
                                    <div className="placement-badge">
                                        <span className="placement-number">{placementRank}</span>
                                        <span className="placement-suffix">
                                            {placementSuffix[index] ?? 'TH'}
                                        </span>
                                    </div>
                                    <div className="placement-details">
                                        <p className="placement-name">{college.name}</p>
                                        <p className="placement-cost">{formatCurrency(college.aidAmount)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!hasUnlockedFullList && (
                        <div className="cta">
                            <button
                                type="button"
                                className="cta-link"
                                onClick={handleCtaClick}
                            >
                                Find your perfect college
                            </button>
                            <span className="cta-chevron">⌄</span>
                        </div>
                    )}
                </section>
            </div>

            {isModalOpen && (
                <div className="email-modal-overlay" role="dialog" aria-modal="true">
                    <div className="email-modal">
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setIsModalOpen(false)}
                            aria-label="Close email form"
                        >
                            ×
                        </button>
                        <h3 className="modal-title">Get the complete list</h3>
                        <p className="modal-subtitle">Drop your email to unlock more colleges.</p>
                        <form onSubmit={handleEmailSubmit}>
                            <input
                                type="email"
                                className="modal-input"
                                placeholder="you@email.com"
                                value={emailInput}
                                onChange={(event) => {
                                    setEmailInput(event.target.value);
                                    setEmailError('');
                                }}
                            />
                            {emailError && <p className="modal-error">{emailError}</p>}
                            <button type="submit" className="modal-submit">
                                Unlock colleges
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FinancialAidCalculator;
