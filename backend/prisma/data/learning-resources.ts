// Curated, free learning material shared with every college. Only stable,
// official or long-running URLs; videos are fetched live per skill instead.
export interface ResourceSeed {
  skill: string;
  title: string;
  url: string;
  type: "ARTICLE" | "COURSE" | "PRACTICE" | "DOCUMENTATION" | "VIDEO";
  provider: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  durationMinutes?: number;
  description: string;
}

export const LEARNING_RESOURCES: ResourceSeed[] = [
  // Web
  { skill: "JavaScript", title: "The Modern JavaScript Tutorial", url: "https://javascript.info/", type: "ARTICLE", provider: "javascript.info", level: "Beginner", description: "From the basics to closures, promises and the event loop, with exercises per chapter." },
  { skill: "JavaScript", title: "JavaScript guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", type: "DOCUMENTATION", provider: "MDN", level: "Intermediate", description: "The reference guide most interviewers expect you to know your way around." },
  { skill: "TypeScript", title: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html", type: "DOCUMENTATION", provider: "TypeScript", level: "Beginner", description: "Types, narrowing, generics and how to add TypeScript to a JavaScript project." },
  { skill: "React", title: "Learn React", url: "https://react.dev/learn", type: "DOCUMENTATION", provider: "react.dev", level: "Beginner", description: "Official interactive course: components, state, effects and thinking in React." },
  { skill: "React", title: "Front End Development Libraries certification", url: "https://www.freecodecamp.org/learn/front-end-development-libraries/", type: "COURSE", provider: "freeCodeCamp", level: "Intermediate", durationMinutes: 1800, description: "Project-based React and Redux practice with a free certificate." },
  { skill: "Node.js", title: "Learn Node.js", url: "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs", type: "DOCUMENTATION", provider: "Node.js", level: "Beginner", description: "Official introduction: modules, the event loop, files, HTTP and npm." },
  { skill: "Node.js", title: "Back End Development and APIs", url: "https://www.freecodecamp.org/learn/back-end-development-and-apis/", type: "COURSE", provider: "freeCodeCamp", level: "Intermediate", durationMinutes: 1800, description: "Build Node and Express microservices and connect them to MongoDB." },
  { skill: "Express", title: "Express guide", url: "https://expressjs.com/en/guide/routing.html", type: "DOCUMENTATION", provider: "Express", level: "Beginner", description: "Routing, middleware and error handling, the parts every backend round asks about." },
  { skill: "REST API", title: "HTTP overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", type: "DOCUMENTATION", provider: "MDN", level: "Beginner", description: "Methods, status codes, headers and caching: the foundation of REST design." },
  { skill: "Web Development", title: "Learn web development", url: "https://developer.mozilla.org/en-US/docs/Learn_web_development", type: "COURSE", provider: "MDN", level: "Beginner", description: "Structured path through HTML, CSS and JavaScript with assessments." },
  { skill: "Web Development", title: "Responsive Web Design certification", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", type: "COURSE", provider: "freeCodeCamp", level: "Beginner", durationMinutes: 1800, description: "Build five projects covering HTML, CSS, flexbox and grid." },

  // Languages
  { skill: "Python", title: "The Python Tutorial", url: "https://docs.python.org/3/tutorial/", type: "DOCUMENTATION", provider: "Python.org", level: "Beginner", description: "The official tutorial: data structures, modules, errors and classes." },
  { skill: "Python", title: "Python course", url: "https://www.kaggle.com/learn/python", type: "COURSE", provider: "Kaggle Learn", level: "Beginner", durationMinutes: 300, description: "Short hands-on notebooks; a quick way to get productive." },
  { skill: "Java", title: "Learn Java", url: "https://dev.java/learn/", type: "DOCUMENTATION", provider: "dev.java", level: "Beginner", description: "Oracle's official learning path from syntax to collections and streams." },
  { skill: "Java", title: "Java practice", url: "https://www.hackerrank.com/domains/java", type: "PRACTICE", provider: "HackerRank", level: "Beginner", description: "Graded exercises from basics to OOP and data structures." },
  { skill: "C++", title: "Learn C++", url: "https://www.learncpp.com/", type: "ARTICLE", provider: "LearnCpp.com", level: "Beginner", description: "Thorough, free C++ course that most competitive programmers start from." },
  { skill: "Problem Solving", title: "CS50x: Introduction to Computer Science", url: "https://cs50.harvard.edu/x/", type: "COURSE", provider: "Harvard", level: "Beginner", durationMinutes: 6000, description: "The classic foundations course: C, algorithms, memory, Python and SQL." },

  // Data structures and algorithms
  { skill: "Data Structures", title: "NeetCode roadmap", url: "https://neetcode.io/roadmap", type: "PRACTICE", provider: "NeetCode", level: "Intermediate", description: "Interview problems grouped by pattern, in the order worth learning them." },
  { skill: "Data Structures", title: "LeetCode problem set", url: "https://leetcode.com/problemset/", type: "PRACTICE", provider: "LeetCode", level: "Intermediate", description: "Filter by topic and company; start with Easy arrays, strings and hash maps." },
  { skill: "Algorithms", title: "Algorithms for Competitive Programming", url: "https://cp-algorithms.com/", type: "ARTICLE", provider: "cp-algorithms", level: "Advanced", description: "Clear write-ups of graph, string, number theory and DP algorithms." },
  { skill: "Problem Solving", title: "Problem solving practice", url: "https://www.hackerrank.com/domains/algorithms", type: "PRACTICE", provider: "HackerRank", level: "Beginner", description: "Warm-up to medium problems, similar to many online assessment rounds." },

  // Databases
  { skill: "SQL", title: "SQLBolt interactive lessons", url: "https://sqlbolt.com/", type: "PRACTICE", provider: "SQLBolt", level: "Beginner", durationMinutes: 120, description: "Short interactive lessons from SELECT to joins and aggregates." },
  { skill: "SQL", title: "SQL practice", url: "https://www.hackerrank.com/domains/sql", type: "PRACTICE", provider: "HackerRank", level: "Intermediate", description: "Graded SQL problems, close to the SQL rounds in campus tests." },
  { skill: "PostgreSQL", title: "PostgreSQL tutorial", url: "https://www.postgresql.org/docs/current/tutorial.html", type: "DOCUMENTATION", provider: "PostgreSQL", level: "Beginner", description: "Official tutorial: tables, queries, joins, transactions and window functions." },
  { skill: "MongoDB", title: "MongoDB University", url: "https://learn.mongodb.com/", type: "COURSE", provider: "MongoDB", level: "Beginner", description: "Free official courses on CRUD, aggregation and data modelling." },

  // Cloud and DevOps
  { skill: "Git", title: "Pro Git book", url: "https://git-scm.com/book/en/v2", type: "DOCUMENTATION", provider: "git-scm.com", level: "Beginner", description: "Branching, merging, rebasing and remote workflows, free online." },
  { skill: "Git", title: "Learn Git Branching", url: "https://learngitbranching.js.org/", type: "PRACTICE", provider: "learngitbranching", level: "Beginner", durationMinutes: 90, description: "Visual, interactive puzzles that make branching and rebasing click." },
  { skill: "Docker", title: "Docker: Get started", url: "https://docs.docker.com/get-started/", type: "DOCUMENTATION", provider: "Docker", level: "Beginner", description: "Images, containers, volumes and Compose with a sample app." },
  { skill: "Kubernetes", title: "Kubernetes basics", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/", type: "DOCUMENTATION", provider: "Kubernetes", level: "Intermediate", description: "Deploy, expose, scale and update an app on a cluster." },
  { skill: "AWS", title: "AWS Skill Builder", url: "https://skillbuilder.aws/", type: "COURSE", provider: "Amazon Web Services", level: "Beginner", description: "Free digital training, including Cloud Practitioner exam preparation." },
  { skill: "Linux", title: "Linux Journey", url: "https://linuxjourney.com/", type: "ARTICLE", provider: "Linux Journey", level: "Beginner", description: "Command line, permissions, processes and networking in small lessons." },
  { skill: "System Design", title: "The System Design Primer", url: "https://github.com/donnemartin/system-design-primer", type: "ARTICLE", provider: "GitHub", level: "Advanced", description: "Scalability, caching, databases and worked design interview questions." },

  // Data
  { skill: "Machine Learning", title: "Intro to Machine Learning", url: "https://www.kaggle.com/learn/intro-to-machine-learning", type: "COURSE", provider: "Kaggle Learn", level: "Beginner", durationMinutes: 180, description: "Build and validate your first models with scikit-learn." },
  { skill: "Machine Learning", title: "Machine Learning Crash Course", url: "https://developers.google.com/machine-learning/crash-course", type: "COURSE", provider: "Google", level: "Intermediate", durationMinutes: 900, description: "Regression, classification, embeddings and fairness with exercises." },
  { skill: "Statistics", title: "Statistics and probability", url: "https://www.khanacademy.org/math/statistics-probability", type: "COURSE", provider: "Khan Academy", level: "Beginner", description: "Distributions, hypothesis testing and regression, with practice." },
  { skill: "Data Analysis", title: "Pandas course", url: "https://www.kaggle.com/learn/pandas", type: "COURSE", provider: "Kaggle Learn", level: "Beginner", durationMinutes: 240, description: "Selecting, grouping and cleaning data with pandas." },
  { skill: "Power BI", title: "Power BI training", url: "https://learn.microsoft.com/en-us/training/powerplatform/power-bi", type: "COURSE", provider: "Microsoft Learn", level: "Beginner", description: "Official modules on data models, DAX and building reports." },

  // Aptitude and soft skills
  { skill: "Aptitude", title: "Aptitude questions and answers", url: "https://www.indiabix.com/aptitude/questions-and-answers/", type: "PRACTICE", provider: "IndiaBIX", level: "Beginner", description: "Quantitative aptitude by topic, in the style of campus written tests." },
  { skill: "Communication", title: "Online courses on NPTEL", url: "https://nptel.ac.in/courses", type: "COURSE", provider: "NPTEL", level: "Beginner", description: "Search for soft skills and technical English courses from IIT faculty." },
];
