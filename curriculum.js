/* Wonder Academy — curriculum map (England National Curriculum, Years 1–9)
   Each year lists skills per subject. Maths skills point at a question
   generator; English and Science skills carry their own question banks
   (see content-english.js / content-science.js). */

const YEARS = [
  { y: 1, name: 'Year 1', stage: 'KS1', ages: '5–6' },
  { y: 2, name: 'Year 2', stage: 'KS1', ages: '6–7' },
  { y: 3, name: 'Year 3', stage: 'Lower KS2', ages: '7–8' },
  { y: 4, name: 'Year 4', stage: 'Lower KS2', ages: '8–9' },
  { y: 5, name: 'Year 5', stage: 'Upper KS2', ages: '9–10' },
  { y: 6, name: 'Year 6', stage: 'Upper KS2', ages: '10–11' },
  { y: 7, name: 'Year 7', stage: 'KS3', ages: '11–12' },
  { y: 8, name: 'Year 8', stage: 'KS3', ages: '12–13' },
  { y: 9, name: 'Year 9', stage: 'KS3', ages: '13–14' }
];

const SUBJECTS = [
  { id: 'maths',   name: 'Maths',   icon: '∑' },
  { id: 'english', name: 'English', icon: '✎' },
  { id: 'science', name: 'Science', icon: '⚗' }
];

/* ---------------------------------------------------------------- Maths -- */

const MATHS_SKILLS = {
  1: [
    { id: 'm1a', name: 'Counting and place value to 100', gen: 'placeValue',
      obj: 'Count to and across 100, read and write numbers to 100 in numerals.' },
    { id: 'm1b', name: 'Adding and subtracting within 20', gen: 'addSub',
      obj: 'Add and subtract one-digit and two-digit numbers to 20, including zero.' },
    { id: 'm1c', name: 'Doubles, halves and sharing', gen: 'mulDiv',
      obj: 'Solve one-step multiplication and division problems using objects and arrays.' },
    { id: 'm1d', name: 'Halves and quarters', gen: 'fractions',
      obj: 'Recognise, find and name a half and a quarter of an object, shape or quantity.' },
    { id: 'm1e', name: 'Measures, money and time', gen: 'measurement',
      obj: 'Compare lengths, mass, capacity and time; recognise coins and notes.' },
    { id: 'm1f', name: 'Shapes and turns', gen: 'geometry',
      obj: 'Recognise and name common 2-D and 3-D shapes; describe position and turns.' }
  ],
  2: [
    { id: 'm2a', name: 'Place value to 100', gen: 'placeValue',
      obj: 'Recognise the place value of each digit in a two-digit number (tens, ones).' },
    { id: 'm2b', name: 'Adding and subtracting to 100', gen: 'addSub',
      obj: 'Add and subtract two-digit numbers and ones, and two-digit numbers and tens.' },
    { id: 'm2c', name: '2, 5 and 10 times tables', gen: 'timesTables',
      obj: 'Recall and use multiplication and division facts for the 2, 5 and 10 tables.' },
    { id: 'm2d', name: 'Fractions of amounts', gen: 'fractions',
      obj: 'Find 1/3, 1/4, 2/4 and 3/4 of a length, shape, set of objects or quantity.' },
    { id: 'm2e', name: 'Money and time', gen: 'measurement',
      obj: 'Combine amounts of money; tell the time to five minutes.' },
    { id: 'm2f', name: 'Shape properties', gen: 'geometry',
      obj: 'Identify and describe the properties of 2-D and 3-D shapes; lines of symmetry.' },
    { id: 'm2g', name: 'Charts and tables', gen: 'statistics',
      obj: 'Interpret and construct simple pictograms, tally charts and block diagrams.' }
  ],
  3: [
    { id: 'm3a', name: 'Place value to 1000', gen: 'placeValue',
      obj: 'Recognise the place value of each digit in a three-digit number.' },
    { id: 'm3b', name: 'Column addition and subtraction', gen: 'addSub',
      obj: 'Add and subtract numbers with up to three digits using formal written methods.' },
    { id: 'm3c', name: '3, 4 and 8 times tables', gen: 'timesTables',
      obj: 'Recall and use multiplication and division facts for the 3, 4 and 8 tables.' },
    { id: 'm3d', name: 'Tenths and unit fractions', gen: 'fractions',
      obj: 'Count up and down in tenths; compare and order unit fractions.' },
    { id: 'm3e', name: 'Measure, money and time', gen: 'measurement',
      obj: 'Measure, compare, add and subtract lengths, mass and volume; tell time to the minute.' },
    { id: 'm3f', name: 'Angles and lines', gen: 'geometry',
      obj: 'Identify right angles; recognise horizontal, vertical, parallel and perpendicular lines.' },
    { id: 'm3g', name: 'Bar charts and tables', gen: 'statistics',
      obj: 'Interpret and present data using bar charts, pictograms and tables.' }
  ],
  4: [
    { id: 'm4a', name: 'Place value to 10 000', gen: 'placeValue',
      obj: 'Order and compare numbers beyond 1000; round to the nearest 10, 100 or 1000.' },
    { id: 'm4b', name: 'Four-digit addition and subtraction', gen: 'addSub',
      obj: 'Add and subtract numbers with up to four digits using formal written methods.' },
    { id: 'm4c', name: 'Times tables to 12 × 12', gen: 'timesTables',
      obj: 'Recall multiplication and division facts for multiplication tables up to 12 × 12.' },
    { id: 'm4d', name: 'Decimals and equivalent fractions', gen: 'fractions',
      obj: 'Recognise equivalent fractions; count in hundredths; write decimal equivalents.' },
    { id: 'm4e', name: 'Perimeter, area and time', gen: 'measurement',
      obj: 'Measure and calculate perimeter; find area by counting squares; convert units of time.' },
    { id: 'm4f', name: 'Symmetry and coordinates', gen: 'geometry',
      obj: 'Classify triangles and quadrilaterals; plot points in the first quadrant.' },
    { id: 'm4g', name: 'Comparing data', gen: 'statistics',
      obj: 'Interpret and present discrete and continuous data using bar charts and line graphs.' },
    { id: 'm4h', name: 'Negative numbers', gen: 'negatives',
      obj: 'Count backwards through zero to include negative numbers.' }
  ],
  5: [
    { id: 'm5a', name: 'Place value to a million', gen: 'placeValue',
      obj: 'Read, write, order and compare numbers to at least 1 000 000; round accordingly.' },
    { id: 'm5b', name: 'Mental and written calculation', gen: 'addSub',
      obj: 'Add and subtract whole numbers with more than four digits using formal methods.' },
    { id: 'm5c', name: 'Long multiplication and division', gen: 'mulDiv',
      obj: 'Multiply four-digit by two-digit numbers; divide with remainders.' },
    { id: 'm5d', name: 'Fractions, decimals and percentages', gen: 'decimalsPercents',
      obj: 'Recognise the % symbol; write percentages as fractions and decimals.' },
    { id: 'm5e', name: 'Volume, area and converting units', gen: 'measurement',
      obj: 'Convert between metric units; calculate area of rectangles; estimate volume.' },
    { id: 'm5f', name: 'Angles and 3-D shapes', gen: 'geometry',
      obj: 'Estimate, measure and draw angles; identify 3-D shapes from 2-D representations.' },
    { id: 'm5g', name: 'Line graphs and tables', gen: 'statistics',
      obj: 'Complete, read and interpret information in tables and line graphs.' },
    { id: 'm5h', name: 'Factors, multiples and primes', gen: 'primesFactors',
      obj: 'Identify factors, multiples and prime numbers; know squares and cubes.' }
  ],
  6: [
    { id: 'm6a', name: 'Place value to 10 million', gen: 'placeValue',
      obj: 'Read, write, order and compare numbers up to 10 000 000; round any whole number.' },
    { id: 'm6b', name: 'Order of operations', gen: 'addSub',
      obj: 'Use knowledge of the order of operations to carry out calculations.' },
    { id: 'm6c', name: 'Long division and multiplication', gen: 'mulDiv',
      obj: 'Divide four-digit by two-digit numbers using long division; multiply fluently.' },
    { id: 'm6d', name: 'Calculating with fractions', gen: 'fractions',
      obj: 'Add, subtract, multiply and divide fractions; simplify where possible.' },
    { id: 'm6e', name: 'Percentages and decimals', gen: 'decimalsPercents',
      obj: 'Recall and use equivalences between fractions, decimals and percentages.' },
    { id: 'm6f', name: 'Ratio and proportion', gen: 'ratio',
      obj: 'Solve problems involving the relative sizes of two quantities and scale factors.' },
    { id: 'm6g', name: 'Introducing algebra', gen: 'algebra',
      obj: 'Use simple formulae; express missing number problems algebraically.' },
    { id: 'm6h', name: 'Area, volume and angles', gen: 'geometry',
      obj: 'Calculate area of triangles and parallelograms; volume of cuboids; missing angles.' },
    { id: 'm6i', name: 'The mean and pie charts', gen: 'statistics',
      obj: 'Calculate and interpret the mean as an average; interpret pie charts.' }
  ],
  7: [
    { id: 'm7a', name: 'Integers and negative numbers', gen: 'negatives',
      obj: 'Order positive and negative integers; use the four operations with negatives.' },
    { id: 'm7b', name: 'Factors, multiples, primes, HCF and LCM', gen: 'primesFactors',
      obj: 'Use prime factorisation to find highest common factors and lowest common multiples.' },
    { id: 'm7c', name: 'Fractions, decimals and percentages', gen: 'decimalsPercents',
      obj: 'Move fluently between fractions, decimals and percentages; percentage of an amount.' },
    { id: 'm7d', name: 'Algebraic notation and substitution', gen: 'algebra',
      obj: 'Use and interpret algebraic notation; substitute numerical values into formulae.' },
    { id: 'm7e', name: 'Solving one- and two-step equations', gen: 'algebra',
      obj: 'Solve linear equations with the unknown on one side.' },
    { id: 'm7f', name: 'Ratio and proportion', gen: 'ratio',
      obj: 'Divide a quantity in a given ratio; use scale factors and unit conversion.' },
    { id: 'm7g', name: 'Area, perimeter and angle facts', gen: 'geometry',
      obj: 'Derive and use area formulae; angles at a point, on a line and in a triangle.' },
    { id: 'm7h', name: 'Averages and range', gen: 'statistics',
      obj: 'Describe a set of data using mean, median, mode and range.' }
  ],
  8: [
    { id: 'm8a', name: 'Powers, roots and index laws', gen: 'indices',
      obj: 'Use positive integer powers and associated real roots; apply the index laws.' },
    { id: 'm8b', name: 'Expanding and factorising', gen: 'algebra',
      obj: 'Simplify and manipulate expressions by expanding brackets and taking out factors.' },
    { id: 'm8c', name: 'Equations with brackets and fractions', gen: 'algebra',
      obj: 'Solve linear equations with the unknown on both sides.' },
    { id: 'm8d', name: 'Straight-line graphs', gen: 'algebra',
      obj: 'Recognise, sketch and interpret graphs of linear functions y = mx + c.' },
    { id: 'm8e', name: 'Percentage change and interest', gen: 'decimalsPercents',
      obj: 'Solve percentage increase and decrease problems, including simple interest.' },
    { id: 'm8f', name: 'Direct and inverse proportion', gen: 'ratio',
      obj: 'Use ratio notation and solve problems involving direct and inverse proportion.' },
    { id: 'm8g', name: 'Circles, prisms and angles in polygons', gen: 'geometry',
      obj: 'Calculate circumference and area of circles; interior and exterior angles.' },
    { id: 'm8h', name: 'Probability', gen: 'probability',
      obj: 'Record and analyse the frequency of outcomes; use the probability scale 0–1.' }
  ],
  9: [
    { id: 'm9a', name: 'Standard form and surds', gen: 'indices',
      obj: 'Interpret and calculate with numbers written in standard index form.' },
    { id: 'm9b', name: 'Quadratics and factorising', gen: 'algebra',
      obj: 'Factorise quadratic expressions of the form x² + bx + c.' },
    { id: 'm9c', name: 'Simultaneous equations', gen: 'algebra',
      obj: 'Solve two linear simultaneous equations algebraically and graphically.' },
    { id: 'm9d', name: 'Pythagoras and trigonometry', gen: 'geometry',
      obj: "Apply Pythagoras' theorem and trigonometric ratios in right-angled triangles." },
    { id: 'm9e', name: 'Compound measures and growth', gen: 'ratio',
      obj: 'Use compound units such as speed and density; repeated percentage change.' },
    { id: 'm9f', name: 'Probability of combined events', gen: 'probability',
      obj: 'Use tree diagrams and sample spaces for independent combined events.' },
    { id: 'm9g', name: 'Statistics and scatter graphs', gen: 'statistics',
      obj: 'Describe correlation; interpret scatter graphs and grouped data.' },
    { id: 'm9h', name: 'Inequalities and sequences', gen: 'algebra',
      obj: 'Solve linear inequalities; find the nth term of a linear sequence.' }
  ]
};

/* Assembled at load time in app.js: SKILLS[subject][year] = [...] */
const SKILLS = {
  maths: MATHS_SKILLS,
  english: {},   // filled by content-english.js
  science: {}    // filled by content-science.js
};
