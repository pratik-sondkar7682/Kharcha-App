/**
 * FilterContext — Global date filter shared across Dashboard and Insights
 */
import React, { createContext, useContext, useState } from 'react';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
    const [dateFilter, setDateFilter]   = useState('current_month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd]     = useState('');

    return (
        <FilterContext.Provider value={{ dateFilter, setDateFilter, customStart, setCustomStart, customEnd, setCustomEnd }}>
            {children}
        </FilterContext.Provider>
    );
}

export function useFilter() {
    return useContext(FilterContext);
}
