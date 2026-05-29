const peopleList = document.querySelector("#peopleList");
const personTemplate = document.querySelector("#personTemplate");
const addPersonButton = document.querySelector("#addPerson");
const meetingForm = document.querySelector("#meetingForm");
const totalCost = document.querySelector("#totalCost");
const verdict = document.querySelector("#verdict");
const recommendation = document.querySelector("#recommendation");
const message = document.querySelector("#message");
const history = document.querySelector("#history");
const dbStatus = document.querySelector("#dbStatus");
const recalculateButton = document.querySelector("#recalculate");
const submitMeeting = document.querySelector("#submitMeeting");
const editBanner = document.querySelector("#editBanner");
const cancelEdit = document.querySelector("#cancelEdit");

let editingMeetingId = null;
let savedMeetings = [];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function addPerson(name = "", hourlyCost = "", availability = "full-time") {
  const row = personTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".person-name").value = name;
  row.querySelector(".person-cost").value = hourlyCost;
  row.querySelector(".person-type").value = availability;
  row.querySelector(".remove-person").addEventListener("click", () => {
    row.remove();
    updateRecommendation();
  });
  row.addEventListener("input", updateRecommendation);
  peopleList.appendChild(row);
}

function getPayload() {
  const attendees = [...document.querySelectorAll(".person-row")].map((row) => ({
    name: row.querySelector(".person-name").value,
    hourlyCost: row.querySelector(".person-cost").value,
    availability: row.querySelector(".person-type").value
  }));

  return {
    agenda: document.querySelector("#agenda").value,
    lengthMinutes: document.querySelector("#lengthMinutes").value,
    attendees
  };
}

function resetForm() {
  editingMeetingId = null;
  meetingForm.reset();
  peopleList.innerHTML = "";
  addPerson();
  editBanner.hidden = true;
  submitMeeting.textContent = "Save meeting";
  updateRecommendation();
}

function enterEditMode(meetingId) {
  const meeting = savedMeetings.find((item) => item._id === meetingId);
  if (!meeting) return;

  editingMeetingId = meeting._id;
  document.querySelector("#agenda").value = meeting.agenda;
  document.querySelector("#lengthMinutes").value = meeting.lengthMinutes;
  peopleList.innerHTML = "";
  meeting.attendees.forEach((person) => {
    addPerson(person.name, person.hourlyCost, person.availability);
  });
  editBanner.hidden = false;
  submitMeeting.textContent = "Update meeting";
  message.textContent = "Editing saved meeting.";
  message.classList.remove("error");
  updateRecommendation();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function updateRecommendation() {
  message.classList.remove("error");

  try {
    const response = await fetch("/api/recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getPayload())
    });
    const data = await response.json();

    if (!response.ok) {
      totalCost.textContent = currency.format(0);
      verdict.textContent = "Add details";
      recommendation.textContent = data.error;
      return;
    }

    totalCost.textContent = currency.format(data.totalCost);
    verdict.textContent = data.recommendation.verdict;
    recommendation.textContent = data.recommendation.message;
  } catch (error) {
    message.textContent = "Could not calculate. Is the server running?";
    message.classList.add("error");
  }
}

async function loadHistory() {
  try {
    const response = await fetch("/api/meetings");
    const data = await response.json();

    if (!response.ok) {
      history.innerHTML = `<p>${escapeHtml(data.error || "Past meetings could not be loaded.")}</p>`;
      return;
    }

    dbStatus.textContent = data.mongoReady ? "MongoDB connected" : "MongoDB offline";
    dbStatus.classList.toggle("ready", data.mongoReady);
    savedMeetings = data.meetings || [];

    if (!savedMeetings.length) {
      history.innerHTML = "<p>No saved meetings yet.</p>";
      return;
    }

    history.innerHTML = savedMeetings
      .map((meeting) => {
        const date = new Date(meeting.createdAt).toLocaleString();
        return `
          <div class="history-item">
            <strong>${escapeHtml(meeting.agenda)}</strong>
            <p>${meeting.lengthMinutes} min - ${meeting.attendees.length} people - ${currency.format(meeting.totalCost)}</p>
            <p>${meeting.recommendation.verdict} - ${escapeHtml(meeting.recommendation.message)}</p>
            <small>${date}</small>
            <div class="history-actions">
              <button type="button" data-edit-id="${meeting._id}">Edit</button>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    dbStatus.textContent = "Server offline";
    history.innerHTML = "<p>Past meetings could not be loaded.</p>";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

addPersonButton.addEventListener("click", () => {
  addPerson();
  updateRecommendation();
});

recalculateButton.addEventListener("click", updateRecommendation);
cancelEdit.addEventListener("click", resetForm);

history.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  if (!editButton) return;

  enterEditMode(editButton.dataset.editId);
});

meetingForm.addEventListener("input", updateRecommendation);

meetingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = editingMeetingId ? "Updating..." : "Saving...";
  message.classList.remove("error");

  try {
    const url = editingMeetingId
      ? `/api/meetings/${editingMeetingId}`
      : "/api/meetings";
    const response = await fetch(url, {
      method: editingMeetingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getPayload())
    });
    const data = await response.json();

    if (!response.ok) {
      message.textContent = data.error;
      message.classList.add("error");
      return;
    }

    const successMessage = editingMeetingId
      ? "Meeting updated."
      : "Meeting saved.";
    resetForm();
    message.textContent = successMessage;
    await loadHistory();
  } catch (error) {
    message.textContent = "Save failed. Check the server.";
    message.classList.add("error");
  }
});

resetForm();
loadHistory();
