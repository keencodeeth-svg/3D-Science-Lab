import http from 'node:http';
import { generateCopilotReply } from './lib/ai-copilot.mjs';
import { recordLabTelemetry } from './lib/telemetry.mjs';
import { ensureRuntimeState, readState, updateState } from './lib/state-store.mjs';
import { loadExperimentConfigById, loadExperimentIndex } from './lib/experiment-catalog.mjs';

const port = Number(process.env.PORT ?? 4318);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  response.end();
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { message });
}

function isClientInputMessage(message) {
  return ['Unsupported', 'requires', 'must be', 'is required', 'payload'].some((keyword) => message.includes(keyword));
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeAssignments(assignments) {
  return [...assignments].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function getStudentsByClassId(students, classId) {
  return students.filter((student) => student.classId === classId);
}

function calculateAverage(records, selector) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + selector(record), 0) / records.length);
}

function getUniqueExperimentIds(assignments) {
  return [...new Set(assignments.map((assignment) => assignment.experimentId))];
}

function buildClassProgress(classroom, classAssignments, attempts, students) {
  const roster = getStudentsByClassId(students, classroom.id);
  const experimentIds = getUniqueExperimentIds(classAssignments);
  const relatedAttempts = attempts.filter((attempt) => attempt.classId === classroom.id && (experimentIds.length ? experimentIds.includes(attempt.experimentId) : false));
  const completedStudentIds = new Set(relatedAttempts.filter((attempt) => attempt.status === 'completed' && attempt.studentId).map((attempt) => attempt.studentId));
  const inProgressStudentIds = new Set(relatedAttempts.filter((attempt) => attempt.status === 'in_progress' && attempt.studentId).map((attempt) => attempt.studentId));
  const completedStudents = completedStudentIds.size;
  const inProgressStudents = [...inProgressStudentIds].filter((studentId) => !completedStudentIds.has(studentId)).length;
  const pendingStudents = Math.max(roster.length - completedStudents - inProgressStudents, 0);

  return {
    classId: classroom.id,
    className: classroom.name,
    rosterSize: roster.length,
    assignmentCount: classAssignments.length,
    completionRate: roster.length ? Math.round((completedStudents / roster.length) * 100) : 0,
    completedStudents,
    inProgressStudents,
    pendingStudents,
    averageScore: calculateAverage(relatedAttempts, (attempt) => attempt.score),
    averageErrors: calculateAverage(relatedAttempts, (attempt) => attempt.errorCount),
  };
}

function buildClassAnalytics(classroom, classAssignments, attempts) {
  const experimentIds = getUniqueExperimentIds(classAssignments);
  const relatedAttempts = attempts.filter((attempt) => attempt.classId === classroom.id && (experimentIds.length ? experimentIds.includes(attempt.experimentId) : false));
  const errorCounter = new Map();

  relatedAttempts.forEach((attempt) => {
    attempt.replay.forEach((event) => {
      if (event.eventType !== 'error') return;
      errorCounter.set(event.message, (errorCounter.get(event.message) ?? 0) + 1);
    });
  });

  return {
    classId: classroom.id,
    className: classroom.name,
    attemptCount: relatedAttempts.length,
    averageScore: calculateAverage(relatedAttempts, (attempt) => attempt.score),
    averageErrors: calculateAverage(relatedAttempts, (attempt) => attempt.errorCount),
    topErrors: [...errorCounter.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count })),
  };
}

function validateTelemetryInput(payload) {
  const requiredStringFields = ['experimentId', 'experimentTitle', 'subject', 'stage', 'grade', 'stepLabel', 'message', 'eventType'];
  for (const field of requiredStringFields) {
    if (typeof payload[field] !== 'string' || payload[field].trim().length === 0) {
      throw new Error(`${field} is required`);
    }
  }

  if (!Number.isInteger(payload.step) || payload.step < 1) {
    throw new Error('step must be a positive integer');
  }

  if (!Number.isInteger(payload.totalSteps) || payload.totalSteps < 1) {
    throw new Error('totalSteps must be a positive integer');
  }

  if (typeof payload.score !== 'number' || Number.isNaN(payload.score)) {
    throw new Error('score must be a number');
  }

  if (!Number.isInteger(payload.errors) || payload.errors < 0) {
    throw new Error('errors must be a non-negative integer');
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendError(response, 400, 'Missing request URL');
    return;
  }

  if (request.method === 'OPTIONS') {
    sendNoContent(response);
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/v1/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/v1/platform/bootstrap' && request.method === 'GET') {
      const state = await readState();
      sendJson(response, 200, state);
      return;
    }

    if (pathname === '/api/v1/platform/current-student' && request.method === 'PATCH') {
      const body = await parseBody(request);
      const studentId = typeof body.studentId === 'string' ? body.studentId : '';

      if (!studentId) {
        sendError(response, 400, 'studentId is required');
        return;
      }

      const nextState = await updateState(async (state) => {
        if (!state.students.some((student) => student.id === studentId)) {
          throw new Error(`Student "${studentId}" does not exist`);
        }

        return {
          ...state,
          currentStudentId: studentId,
        };
      });

      sendJson(response, 200, {
        currentStudentId: nextState.currentStudentId,
        currentStudent: nextState.students.find((student) => student.id === nextState.currentStudentId) ?? null,
      });
      return;
    }

    if (pathname === '/api/v1/auth/me' && request.method === 'GET') {
      const state = await readState();
      const currentStudent = state.students.find((student) => student.id === state.currentStudentId) ?? null;
      sendJson(response, 200, {
        user: currentStudent,
        school: state.school,
      });
      return;
    }

    if (pathname === '/api/v1/auth/login' && request.method === 'POST') {
      const body = await parseBody(request);
      const studentId = typeof body.studentId === 'string' ? body.studentId : '';

      if (!studentId) {
        sendError(response, 400, 'studentId is required');
        return;
      }

      const nextState = await updateState(async (state) => {
        if (!state.students.some((student) => student.id === studentId)) {
          throw new Error(`Student "${studentId}" does not exist`);
        }

        return {
          ...state,
          currentStudentId: studentId,
        };
      });

      sendJson(response, 200, {
        user: nextState.students.find((student) => student.id === nextState.currentStudentId) ?? null,
      });
      return;
    }

    if (pathname === '/api/v1/experiments' && request.method === 'GET') {
      const items = await loadExperimentIndex({
        stage: url.searchParams.get('stage') ?? '',
        subject: url.searchParams.get('subject') ?? '',
        grade: url.searchParams.get('grade') ?? '',
      });
      sendJson(response, 200, { items });
      return;
    }

    if (pathname.startsWith('/api/v1/experiments/') && pathname.endsWith('/config') && request.method === 'GET') {
      const experimentId = decodeURIComponent(pathname.replace('/api/v1/experiments/', '').replace('/config', ''));
      const config = await loadExperimentConfigById(experimentId);
      if (!config) {
        sendError(response, 404, `Experiment "${experimentId}" not found`);
        return;
      }

      sendJson(response, 200, config);
      return;
    }

    if (pathname === '/api/v1/assignments' && request.method === 'GET') {
      const state = await readState();
      sendJson(response, 200, { items: normalizeAssignments(state.assignments) });
      return;
    }

    if (pathname === '/api/v1/assignments' && request.method === 'POST') {
      const body = await parseBody(request);

      if (typeof body.experimentId !== 'string' || body.experimentId.trim().length === 0) {
        sendError(response, 400, 'experimentId is required');
        return;
      }

      if (typeof body.classId !== 'string' || body.classId.trim().length === 0) {
        sendError(response, 400, 'classId is required');
        return;
      }

      if (typeof body.mode !== 'string' || body.mode.trim().length === 0) {
        sendError(response, 400, 'mode is required');
        return;
      }

      if (typeof body.dueDate !== 'string' || body.dueDate.trim().length === 0) {
        sendError(response, 400, 'dueDate is required');
        return;
      }

      const experiment = await loadExperimentConfigById(body.experimentId);
      if (!experiment) {
        sendError(response, 404, `Experiment "${body.experimentId}" not found`);
        return;
      }

      const nextState = await updateState(async (state) => {
        const classroom = state.classrooms.find((item) => item.id === body.classId);
        if (!classroom) {
          throw new Error(`Classroom "${body.classId}" not found`);
        }

        const timestamp = new Date().toISOString();
        const record = {
          assignmentId: createId('assignment'),
          experimentId: experiment.id,
          experimentTitle: experiment.title,
          classId: classroom.id,
          className: classroom.name,
          stage: classroom.stage,
          mode: body.mode,
          dueDate: body.dueDate,
          createdAt: timestamp,
          updatedAt: timestamp,
          notes: typeof body.notes === 'string' ? body.notes : '',
          productStatus: experiment.productization.status,
        };

        return {
          ...state,
          assignments: normalizeAssignments([record, ...state.assignments]),
        };
      });

      sendJson(response, 201, { item: nextState.assignments[0] });
      return;
    }

    if (pathname === '/api/v1/sessions' && request.method === 'GET') {
      const state = await readState();
      sendJson(response, 200, { items: state.attempts });
      return;
    }

    if (pathname === '/api/v1/sessions' && request.method === 'DELETE') {
      await updateState(async (state) => ({
        ...state,
        attempts: [],
      }));
      sendNoContent(response);
      return;
    }

    if (pathname === '/api/v1/sessions/telemetry' && request.method === 'POST') {
      const body = await parseBody(request);
      validateTelemetryInput(body);

      const nextState = await updateState(async (state) => ({
        ...state,
        attempts: recordLabTelemetry(state.attempts, body),
      }));

      sendJson(response, 200, { items: nextState.attempts });
      return;
    }

    if (pathname === '/api/v1/ai/copilot' && request.method === 'POST') {
      const body = await parseBody(request);
      try {
        const state = await readState();
        const result = await generateCopilotReply(state, body);
        sendJson(response, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI Copilot 请求失败';
        const statusCode = isClientInputMessage(message) ? 400 : 500;
        sendError(response, statusCode, message);
      }
      return;
    }

    if (pathname.startsWith('/api/v1/classes/') && pathname.endsWith('/progress') && request.method === 'GET') {
      const classId = decodeURIComponent(pathname.replace('/api/v1/classes/', '').replace('/progress', ''));
      const state = await readState();
      const classroom = state.classrooms.find((item) => item.id === classId);
      if (!classroom) {
        sendError(response, 404, `Classroom "${classId}" not found`);
        return;
      }

      const classAssignments = state.assignments.filter((assignment) => assignment.classId === classId);
      sendJson(response, 200, buildClassProgress(classroom, classAssignments, state.attempts, state.students));
      return;
    }

    if (pathname.startsWith('/api/v1/classes/') && pathname.endsWith('/analytics') && request.method === 'GET') {
      const classId = decodeURIComponent(pathname.replace('/api/v1/classes/', '').replace('/analytics', ''));
      const state = await readState();
      const classroom = state.classrooms.find((item) => item.id === classId);
      if (!classroom) {
        sendError(response, 404, `Classroom "${classId}" not found`);
        return;
      }

      const classAssignments = state.assignments.filter((assignment) => assignment.classId === classId);
      sendJson(response, 200, buildClassAnalytics(classroom, classAssignments, state.attempts));
      return;
    }

    sendError(response, 404, `Route "${pathname}" not found`);
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : 'Unexpected server error');
  }
});

ensureRuntimeState()
  .then(() => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`3D Science Lab backend listening on http://127.0.0.1:${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
