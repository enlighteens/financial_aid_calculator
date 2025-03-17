import React, { useState, Fragment } from 'react';
import { Combobox } from '@headlessui/react';
import states from 'states-us';
import collegeData from './collegeData.json';  // Import the JSON file directly
import './FinancialAidCalculator.css';

function FinancialAidCalculator() {
    const [selectedColleges, setSelectedColleges] = useState([]);
    const [query, setQuery] = useState('');
    const [income, setIncome] = useState("200000");
    const [state, setState] = useState("");
    const [incomeBucket, setIncomeBucket] = useState(">110k");
    const [result, setResult] = useState(false)
    const colleges = Object.keys(collegeData);
    
    const filteredColleges = query === ''
        ? colleges
        : colleges.filter((college) =>
            college.toLowerCase().includes(query.toLowerCase())
        );

    const removeCollege = (collegeToRemove) => {
        setSelectedColleges(selectedColleges.filter(college => college !== collegeToRemove));
    };


    const handleCalculateAidBucket = () => {
        if (income < 30000) {
            setIncomeBucket("<30k");
        } else if (income < 48000) {
            setIncomeBucket("30k-48k");
        } else if (income < 75000) {
            setIncomeBucket("48k-75k");
        } else if (income < 110000) {
            setIncomeBucket("75k-110k");
        } else {
            setIncomeBucket(">110k");
        }
        if (incomeBucket) {
            setResult(true)
        }
    };

    
    // Add international option to states array
    const stateOptions = [
        { abbreviation: 'INTL', name: 'International' },
        ...states
    ];

    return (
        <div className="calculator-container">
            <div className="calculator-wrapper">
                <div className="header">
                    <h1 className="header-title">College Financial Aid Calculator</h1>
                    <p className="header-subtitle">Estimated financial aid packages across multiple colleges</p>
                </div>

                <div className="card">
                    <div className="mb-10">
                        <h2 className="section-title">Select Your Colleges</h2>
                        <div className="selected-colleges">
                            {selectedColleges.map((college) => (
                                <span key={college} className="college-chip">
                                    {college}
                                    <button
                                        type="button"
                                        onClick={() => removeCollege(college)}
                                        className="remove-button"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="search-container">
                            <Combobox value={selectedColleges} onChange={setSelectedColleges} multiple>
                                <Combobox.Input
                                    className="search-input"
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search and select colleges..."
                                    autoComplete="off"
                                />

                                <Combobox.Options className="search-options">
                                    {filteredColleges.map((college) => (
                                        <Combobox.Option
                                            key={college}
                                            value={college}
                                            className={({ active, selected }) =>
                                                `search-option ${selected ? 'search-option-selected' : ''}`
                                            }
                                        >
                                            {({ selected, active }) => (
                                                <>
                                                    <span>
                                                        {college}
                                                    </span>
                                                    {selected && (
                                                        <span className="search-option-check">
                                                            ✓
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </Combobox.Option>
                                    ))}
                                </Combobox.Options>
                            </Combobox>
                        </div>
                    </div>

                    <div className="input-section">
                        <h2 className="section-title">Enter Your Information</h2>
                        <div className="input-group">
                            <label className="input-label">Annual Household Income</label>
                            <div className="income-input-wrapper">
                                <span className="income-symbol">$</span>
                                <input
                                    type="number"
                                    value={income}
                                    onChange={(e) => setIncome(e.target.value)}
                                    className="search-input"
                                    placeholder="Enter your income"
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label">State of Residence</label>
                            <div className="income-input-wrapper">
                                <select
                                    value={state}
                                    onChange={(e) => setState(e.target.value)}
                                    className="search-input"
                                >
                                    <option value="" disabled>Select your state</option>
                                    {stateOptions.map((state) => (
                                        <option 
                                            key={state.abbreviation} 
                                            value={state.abbreviation}
                                        >
                                            {state.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleCalculateAidBucket}
                        className="calculate-button"
                        disabled={!income || selectedColleges.length === 0}
                    >
                        Calculate Financial Aid
                    </button>
                </div>

                {result && (
                    <div className="results-card">
                        <h2 className="section-title">Estimated Financial Aid Results</h2>
                        <div className="space-y-4">
                            {selectedColleges.map((college) => {
                                const collegeInfo = collegeData[college];
                                const inStateFullCosts = collegeInfo.inStateTuition ?? null
                                const isInState = state === collegeInfo.state && inStateFullCosts;

                                const tuitionAndCosts = isInState ? inStateFullCosts:collegeInfo.tuitionAndCosts;
                                const fullTuition = isInState ? inStateFullCosts: collegeInfo.incomeBrackets[">110k"]
                                const tuitionAfterAid = collegeInfo.incomeBrackets[incomeBucket];

                                const finalCosts = tuitionAndCosts - fullTuition + tuitionAfterAid
                                if (!collegeInfo || tuitionAfterAid === undefined) return null;
                                return (
                                    <div key={college} className="result-item">
                                        <h3 className="college-name">{college}</h3>
                                        <div className="result-stats">
                                            <div>
                                                <span className="stat-label">Tuition and Costs</span>
                                                <p className="stat-value base-tuition">
                                                    ${tuitionAndCosts ? tuitionAndCosts.toLocaleString(): "N/A"}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="stat-label">Tuition after Aids</span>
                                                <p className="stat-value aid-amount">
                                                    ${tuitionAfterAid ? tuitionAfterAid.toLocaleString() : 'N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="stat-label">Final Costs</span>
                                                <p className="stat-value final-tuition">
                                                    ${finalCosts ? finalCosts.toLocaleString() : "N/A"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default FinancialAidCalculator; 