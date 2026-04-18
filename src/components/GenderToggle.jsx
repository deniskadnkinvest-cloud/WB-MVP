import React from 'react';
export default function GenderToggle({ gender, setGender }) {
  return (
    <div className="gender-toggle-wrap">
      <span className={`gender-label ${gender === 'female' ? 'active' : ''}`} onClick={() => setGender('female')}>♀ Женщина</span>
      <div className={`gender-toggle ${gender === 'male' ? 'male' : ''}`} onClick={() => setGender(g => g === 'female' ? 'male' : 'female')}>
        <div className="gender-toggle-knob" />
      </div>
      <span className={`gender-label ${gender === 'male' ? 'active' : ''}`} onClick={() => setGender('male')}>Мужчина ♂</span>
    </div>
  );
}
