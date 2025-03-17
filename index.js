import { db } from "./db/index.js";
import { todosTable } from "./db/schema.js";
import { ilike, eq } from "drizzle-orm";
import { FunctionCallingMode, GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline/promises";

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

async function getAllTodos() {
	const res = await db
		.select({ id: todosTable.id, todo: todosTable.todo })
		.from(todosTable);

	return res;
}

async function createTodo(todo) {
	const [res] = await db
		.insert(todosTable)
		.values({ todo })
		.returning({ id: todosTable.id });
	return res?.id || null;
}

async function searchTodo(search) {
	return await db
		.select()
		.from(todosTable)
		.where(ilike(todosTable.todo, `%${search}%`));
}

async function deleteTodo(id) {
	const deleted = await db.delete(todosTable).where(eq(todosTable.id, id));
	return deleted ? "Deleted successfully" : "Failed to delete";
}

const getAllTodosFunctionDeclaration = {
	name: "getAllTodos",
	description:
		"Retrieves a array of all todo items from the database and return in an array containing todo items with their IDs.",
};

const createTodoFunctionDeclaration = {
	name: "createTodo",
	description: "Creates a new todo in the database.",
	parameters: {
		type: "object",
		description: "The todo item to be created.",
		properties: {
			todo: {
				type: "string",
				description: "The content of the todo item.",
			},
		},
		required: ["todo"],
	},
};

const searchTodoFunctionDeclaration = {
	name: "searchTodo",
	description: "Searches for todos that match the provided search term.",
	parameters: {
		type: "object",
		description: "The search term to filter todos.",
		properties: {
			search: {
				type: "string",
				description: "The search term to match against todo items.",
			},
		},
		required: ["search"],
	},
};

const deleteTodoFunctionDeclaration = {
	name: "deleteTodo",
	description: "Deletes a todo item by its ID.",
	parameters: {
		type: "object",
		description: "The ID of the todo item to delete.",
		properties: {
			id: {
				type: "number",
				description: "The unique ID of the todo item.",
			},
		},
		required: ["id"],
	},
};

const functions = {
	getAllTodos: () => {
		return getAllTodos();
	},
	createTodo: ({ todo }) => {
		return createTodo(todo);
	},
	searchTodo: ({ search }) => {
		return searchTodo(search);
	},
	deleteTodo: ({ id }) => {
		return deleteTodo(id);
	},
};

const tools = {
	functionDeclarations: [
		getAllTodosFunctionDeclaration,
		createTodoFunctionDeclaration,
		searchTodoFunctionDeclaration,
		deleteTodoFunctionDeclaration,	
	],
};

const generativeModel = genAI.getGenerativeModel({
	model: "gemini-2.0-flash",
	systemInstruction:
		"You are a To-do Manager who can perform To-do operations, you can perform operations like Create todo, Search todos, Delete todos and Get todos",
	toolConfig: {
		functionCallingConfig: {
			mode: FunctionCallingMode.AUTO,
		},
	},
	tools: tools,
});
async function main() {
	const chat = generativeModel.startChat();
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	while (true) {
		const prompt = await rl.question("You: ");
		if (prompt.toLowerCase() === "exit") break;

		try {
			const result = await chat.sendMessage(prompt);
			console.log("Assistant:", result.response.text());

			const functionCalls = result.response.functionCalls();

			if (functionCalls?.length) {
				for (const call of functionCalls) {
					try {
						const apiResponse = await functions[call.name](
							call.args
						);
						const result2 = await chat.sendMessage([
							{
								function_response: {
									name: call.name,
									response: {
										todos: apiResponse,
									},
								},
							},
						]);

						console.log("Assistant:", result2.response.text());
					} catch (error) {
						console.error("Error:", error);
						console.log("Assistant: Operation failed");
					}
				}
			}
		} catch (error) {
			console.error("Chat Error:", error);
			console.log("Assistant: Sorry, I encountered an error");
		}
	}

	rl.close();
}

main();
